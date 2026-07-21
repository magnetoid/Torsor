// Package server wires the HTTP API. Routes and JSON shapes mirror the legacy
// apps/api Express service 1:1 so the existing frontend works unchanged.
package server

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/httprate"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/magnetoid/torsor/control-plane/internal/auth"
	"github.com/magnetoid/torsor/control-plane/internal/config"
	"github.com/magnetoid/torsor/control-plane/internal/db"
	"github.com/magnetoid/torsor/control-plane/internal/plugin"
	"github.com/magnetoid/torsor/control-plane/internal/redisx"
	"github.com/magnetoid/torsor/control-plane/internal/verify"
)

type Server struct {
	cfg    config.Config
	pool   *pgxpool.Pool
	redis  *redisx.Client
	auth   *auth.Manager
	host   *plugin.Host
	logger *slog.Logger

	// missionCancels maps a running mission's id to its background context.CancelFunc so a
	// stop request can cancel in-flight execution (in-process; single backend today).
	missionCancels sync.Map

	// activeMissions counts missions currently executing in the background, enforcing the
	// engine's max-concurrent-missions cap (in-process; single backend today).
	activeMissions atomic.Int64

	// metrics holds in-process request counters exposed at /metrics (per-instance).
	metrics *serverMetrics

	// previewErrs maps projectID → *previewErrRing: recent console errors the IDE captured
	// from the live preview, readable by the agent (in-process; single backend today).
	previewErrs sync.Map

	// browser is the lazily-located headless browser for the verify_app tool (nil when the
	// host has none — the tool degrades honestly). Guarded by browserOnce.
	browserOnce sync.Once
	browser     *verify.Browser
}

func New(cfg config.Config, pool *pgxpool.Pool, rc *redisx.Client, am *auth.Manager, host *plugin.Host, logger *slog.Logger) *Server {
	return &Server{cfg: cfg, pool: pool, redis: rc, auth: am, host: host, logger: logger, metrics: newServerMetrics()}
}

// Handler builds the chi router with all middleware and routes.
func (s *Server) Handler() http.Handler {
	r := chi.NewRouter()
	r.Use(chimw.RequestID)
	r.Use(chimw.RealIP)
	r.Use(s.observe) // access log + request-id echo + /metrics counters (after RequestID)
	r.Use(chimw.Recoverer)
	r.Use(s.securityHeaders)
	r.Use(s.cors)
	r.Use(s.bodyLimit)

	r.Get("/health", s.handleHealth)
	r.Get("/ready", s.handleReady)
	r.Get("/metrics", s.handleMetrics) // Prometheus text exposition (per-instance counters)

	// Public deployment proxy: serves a deployed project's app at a stable, tokenless URL.
	// Access is gated on an active deployment row (owner-created), not the caller's identity.
	r.HandleFunc("/d/{projectID}", s.handleDeployProxy)
	r.HandleFunc("/d/{projectID}/*", s.handleDeployProxy)

	r.Route("/api/v1", func(r chi.Router) {
		r.Use(httprate.LimitByIP(s.cfg.APIRateLimit, time.Minute))

		r.Get("/", s.handleRoot)
		r.Get("/config", s.handleConfig)

		// WebSocket streaming authenticates from the access_token query param (browsers
		// can't set headers on WebSocket), so it lives outside the Bearer-header group.
		r.Get("/providers/models/{name}/complete/ws", s.handleCompleteWS)

		// Multiplayer presence (live avatars / cursors) + the Yjs co-editing proxy: both
		// are WebSockets authenticated via access_token and scoped to project ownership.
		r.Get("/projects/{projectID}/presence/ws", s.handlePresenceWS)
		r.Get("/projects/{projectID}/collab/ws", s.handleCollabWS)

		// Interactive terminal (PTY): a WebSocket bridged to the runtime's ExecInteractive,
		// carrying stdin/resize up and stdout/stderr down. Authenticated via access_token and
		// scoped to project ownership, same as the other WebSocket routes.
		r.Get("/projects/{projectID}/workspace/pty", s.handleWorkspacePTY)

		// Live-preview proxy: an iframe can't send an Authorization header, so this also
		// authenticates via the access_token query param. Ownership is still enforced.
		r.HandleFunc("/projects/{projectID}/preview", s.handlePreviewProxy)
		r.HandleFunc("/projects/{projectID}/preview/*", s.handlePreviewProxy)

		// Auth-sensitive endpoints get an additional, stricter limiter.
		r.Group(func(r chi.Router) {
			r.Use(httprate.LimitByIP(s.cfg.AuthRateLimit, 15*time.Minute))
			r.Post("/auth/signup", s.handleSignup)
			r.Post("/auth/login", s.handleLogin)
		})

		r.Group(func(r chi.Router) {
			r.Use(s.auth.Require)
			r.Post("/auth/logout", s.handleLogout)
			r.Get("/auth/me", s.handleMe)
			r.Patch("/auth/me", s.handleUpdateMe)

			// User-scoped encrypted secrets (BYO API keys). Values are AES-GCM encrypted
			// at rest and never returned by the list endpoint.
			r.Get("/secrets", s.handleListSecrets)
			r.Post("/secrets", s.handleCreateSecret)
			r.Delete("/secrets/{name}", s.handleDeleteSecret)

			r.Get("/templates", s.handleListTemplates)
			r.Get("/projects", s.handleListProjects)
			r.Post("/projects", s.handleCreateProject)
			r.Get("/projects/{projectID}", s.handleGetProject)
			r.Patch("/projects/{projectID}", s.handleUpdateProject)
			r.Delete("/projects/{projectID}", s.handleDeleteProject)
			r.Get("/projects/{projectID}/files", s.handleListFiles)
			r.Post("/projects/{projectID}/files", s.handleUpsertFile)
			r.Patch("/projects/{projectID}/files/{fileID}", s.handleUpdateFile)
			r.Delete("/projects/{projectID}/files/{fileID}", s.handleDeleteFile)

			// Project memories (durable per-project notes the agent + user share)
			r.Get("/projects/{projectID}/memories", s.handleListMemories)
			r.Post("/projects/{projectID}/memories", s.handleCreateMemory)
			r.Patch("/projects/{projectID}/memories/{memoryID}", s.handleUpdateMemory)
			r.Delete("/projects/{projectID}/memories/{memoryID}", s.handleDeleteMemory)

			// Agent skills (user-defined instructions injected into the agent's prompt)
			r.Get("/projects/{projectID}/skills", s.handleListSkills)
			r.Post("/projects/{projectID}/skills", s.handleCreateSkill)
			r.Patch("/projects/{projectID}/skills/{skillID}", s.handleUpdateSkill)
			r.Delete("/projects/{projectID}/skills/{skillID}", s.handleDeleteSkill)

			// Learning proposals (reflection stages these; user approves/dismisses)
			r.Get("/projects/{projectID}/learning/proposals", s.handleListProposals)
			r.Post("/projects/{projectID}/learning/proposals/{proposalID}/accept", s.handleAcceptProposal)
			r.Post("/projects/{projectID}/learning/proposals/{proposalID}/dismiss", s.handleDismissProposal)

			// Preview error bridge: the IDE forwards console errors it captured from the
			// live preview iframe; the agent reads them via read_preview_errors.
			r.Post("/projects/{projectID}/preview/errors", s.handlePushPreviewErrors)

			// Coding agent engine — missions
			r.Get("/projects/{projectID}/agent/missions", s.handleListMissions)
			r.Post("/projects/{projectID}/agent/missions", s.handleCreateMission)
			r.Get("/projects/{projectID}/agent/missions/{missionID}", s.handleGetMission)
			r.Post("/projects/{projectID}/agent/missions/{missionID}/approve", s.handleApproveMission)
			r.Post("/projects/{projectID}/agent/missions/{missionID}/stop", s.handleStopMission)

			// Teams / Organizations (replaces frontend "Workspaces" mock)
			r.Get("/teams", s.handleListTeams)
			r.Post("/teams", s.handleCreateTeam)
			r.Get("/teams/{teamID}", s.handleGetTeam)
			r.Patch("/teams/{teamID}", s.handleUpdateTeam)
			r.Delete("/teams/{teamID}", s.handleDeleteTeam)
			r.Get("/teams/{teamID}/members", s.handleListTeamMembers)
			r.Post("/teams/{teamID}/invites", s.handleCreateTeamInvite)
			r.Delete("/teams/{teamID}/members/{userID}", s.handleRemoveTeamMember)
			r.Patch("/teams/{teamID}/members/{userID}/role", s.handleUpdateTeamMemberRole)
			r.Post("/teams/invites/{inviteID}/accept", s.handleAcceptTeamInvite)
			r.Delete("/teams/invites/{inviteID}", s.handleRevokeTeamInvite)

			// Audit log (per-user, server-written events).
			r.Get("/audit", s.handleListAudit)

			// Notifications feed (per-user, real DB-backed).
			r.Get("/notifications", s.handleListNotifications)
			r.Post("/notifications/{notificationID}/read", s.handleMarkNotificationRead)
			r.Post("/notifications/read-all", s.handleMarkAllNotificationsRead)
			r.Delete("/notifications/{notificationID}", s.handleDeleteNotification)
			r.Delete("/notifications", s.handleClearNotifications)

			// Per-user coding-agent preferences.
			r.Get("/me/agent-prefs", s.handleGetAgentPrefs)
			r.Patch("/me/agent-prefs", s.handleUpdateAgentPrefs)

			// Platform identity / changelog / feedback (any authed user).
			r.Get("/about", s.handleAbout)
			r.Get("/updates", s.handleListUpdates)
			r.Post("/feedback", s.handleCreateFeedback)

			// Admin / super-admin platform dashboard (role-gated on the effective role:
			// DB role + SUPER_ADMIN_EMAILS promotion, same as apps/api).
			r.Group(func(r chi.Router) {
				r.Use(s.requireRole(auth.RoleAdmin))
				r.Get("/admin/stats", s.handleAdminStats)
				r.Get("/admin/users", s.handleAdminUsers)
			})
			r.Group(func(r chi.Router) {
				r.Use(s.requireRole(auth.RoleSuperAdmin))
				r.Patch("/admin/users/{userID}/role", s.handleAdminUpdateUserRole)
				// Coding agent engine — global config + cross-user observability.
				r.Get("/admin/agent/config", s.handleGetEngineConfig)
				r.Patch("/admin/agent/config", s.handleUpdateEngineConfig)
				r.Get("/admin/agent/missions", s.handleAdminListMissions)
				// Platform observability + settings (real, replaces the mock admin dashboards).
				r.Get("/admin/workspaces", s.handleAdminWorkspaces)
				r.Get("/admin/platform", s.handleAdminPlatform)
				r.Get("/admin/settings", s.handleGetPlatformSettings)
				r.Patch("/admin/settings", s.handleUpdatePlatformSettings)
				// Central update system: broadcast announcements, publish changelog
				// entries, and triage user feedback.
				r.Post("/admin/notifications/broadcast", s.handleAdminBroadcast)
				r.Post("/admin/updates", s.handlePublishUpdate)
				r.Delete("/admin/updates/{updateID}", s.handleDeleteUpdate)
				r.Get("/admin/feedback", s.handleAdminListFeedback)
				r.Patch("/admin/feedback/{feedbackID}", s.handleAdminUpdateFeedback)
			})

			// Project workspace (WorkspaceRuntime capability), scoped to project ownership:
			// the runtime workspace id is the project id, never a client-supplied value.
			r.Post("/projects/{projectID}/workspace", s.handleCreateProjectWorkspace)
			r.Get("/projects/{projectID}/workspace", s.handleGetProjectWorkspace)
			// Template-driven boot: provision (template image) + scaffold + setup + dev, so
			// the preview comes up automatically for a templated project.
			r.Post("/projects/{projectID}/workspace/prepare", s.handlePrepareWorkspace)
			r.Post("/projects/{projectID}/workspace/start", s.handleStartProjectWorkspace)
			r.Post("/projects/{projectID}/workspace/stop", s.handleStopProjectWorkspace)
			r.Post("/projects/{projectID}/workspace/destroy", s.handleDestroyProjectWorkspace)
			r.Post("/projects/{projectID}/workspace/exec/stream", s.handleExecProjectWorkspace)
			r.Get("/projects/{projectID}/workspace/files", s.handleListProjectWorkspaceFiles)
			r.Get("/projects/{projectID}/workspace/file", s.handleReadProjectWorkspaceFile)
			r.Post("/projects/{projectID}/workspace/file", s.handleWriteProjectWorkspaceFile)

			// Git over the workspace (real `git` via WorkspaceRuntime.Exec), ownership-scoped.
			r.Get("/projects/{projectID}/git/status", s.handleGitStatus)
			r.Get("/projects/{projectID}/git/log", s.handleGitLog)
			r.Get("/projects/{projectID}/git/branches", s.handleGitBranches)
			r.Get("/projects/{projectID}/git/diff", s.handleGitDiff)
			r.Post("/projects/{projectID}/git/init", s.handleGitInit)
			r.Post("/projects/{projectID}/git/stage", s.handleGitStage)
			r.Post("/projects/{projectID}/git/unstage", s.handleGitUnstage)
			r.Post("/projects/{projectID}/git/commit", s.handleGitCommit)
			r.Post("/projects/{projectID}/git/branch", s.handleGitCreateBranch)
			r.Post("/projects/{projectID}/git/checkout", s.handleGitCheckout)
			r.Post("/projects/{projectID}/git/revert", s.handleGitRevert)
			r.Post("/projects/{projectID}/git/push", s.handleGitPush)
			r.Post("/projects/{projectID}/git/pull", s.handleGitPull)

			// App Storage over the workspace filesystem (ownership-scoped, auth-gated).
			r.Get("/projects/{projectID}/storage/files", s.handleStorageList)
			r.Post("/projects/{projectID}/storage/upload", s.handleStorageUpload)
			r.Delete("/projects/{projectID}/storage/file", s.handleStorageDelete)
			r.Get("/projects/{projectID}/storage/file", s.handleStorageDownload)

			// Snapshot / restore / fork (microVM sandbox pattern) over the WorkspaceRuntime
			// capability. Runtimes without support return 501; the snapshot handle is a
			// runtime-native id persisted per project (ownership-scoped).
			r.Post("/projects/{projectID}/workspace/snapshot", s.handleSnapshotWorkspace)
			r.Get("/projects/{projectID}/workspace/snapshots", s.handleListWorkspaceSnapshots)
			r.Post("/projects/{projectID}/workspace/restore", s.handleRestoreWorkspace)
			r.Post("/projects/{projectID}/workspace/fork", s.handleForkWorkspace)

			// Checkpoints: file-tree snapshots for restore/rollback (ownership-scoped).
			r.Get("/projects/{projectID}/checkpoints", s.handleListCheckpoints)
			r.Post("/projects/{projectID}/checkpoints", s.handleCreateCheckpoint)
			r.Post("/projects/{projectID}/checkpoints/{checkpointID}/restore", s.handleRestoreCheckpoint)

			// Deploy: expose the project's running workspace app at a stable public URL
			// (/d/{projectID}/, served by handleDeployProxy below). Owner-only controls.
			r.Post("/projects/{projectID}/deploy", s.handleDeploy)
			r.Get("/projects/{projectID}/deployment", s.handleGetDeployment)
			r.Get("/projects/{projectID}/deployments", s.handleListDeployments)
			r.Post("/projects/{projectID}/deployment/stop", s.handleStopDeployment)

			// Custom domains attached to the project's deployment (host-based routing).
			r.Get("/projects/{projectID}/domains", s.handleListDomains)
			r.Post("/projects/{projectID}/domains", s.handleAddDomain)
			r.Delete("/projects/{projectID}/domains/{domainID}", s.handleDeleteDomain)

			// The coding agent loop: streams thought/tool/result/final steps as SSE while
			// the model edits files and runs commands in the owned project's workspace.
			r.Post("/projects/{projectID}/agent/stream", s.handleAgentRunSSE)
			// Background agent runs: enqueue an unattended run, then attach/reattach to its
			// step stream. Work continues even after the browser tab closes.
			r.Post("/projects/{projectID}/agent/tasks", s.handleCreateAgentTask)

			r.Get("/tasks", s.handleListTasks)
			r.Post("/tasks", s.handleCreateTask)
			r.Get("/tasks/{taskID}", s.handleGetTask)
			r.Get("/tasks/{taskID}/events/stream", s.handleTaskEventsSSE)
			r.Post("/tasks/{taskID}/cancel", s.handleCancelTask)

			// Usage: per-user token/cost accounting read back from usage_events.
			r.Get("/usage/summary", s.handleUsageSummary)
			r.Get("/usage/events", s.handleUsageEvents)

			// Capability plugins (kernel + contributions).
			// Container-image marketplace (Docker Hub search) — browse images to deploy.
			r.Get("/registry/images", s.handleSearchRegistryImages)

			r.Get("/providers/models", s.handleListModelProviders)
			r.Get("/providers/models/{name}/catalog", s.handleModelCatalog)
			r.Post("/providers/models/{name}/test", s.handleTestModelProvider)
			r.Post("/providers/models/{name}/complete", s.handleComplete)
			r.Post("/providers/models/{name}/complete/stream", s.handleCompleteSSE)

			// MCP servers: user-configured Model Context Protocol endpoints whose tools the
			// coding agent can call (ownership-scoped; auth headers write-only + encrypted).
			r.Get("/mcp/servers", s.handleListMCPServers)
			r.Post("/mcp/servers", s.handleCreateMCPServer)
			r.Patch("/mcp/servers/{id}", s.handleUpdateMCPServer)
			r.Delete("/mcp/servers/{id}", s.handleDeleteMCPServer)
			r.Post("/mcp/servers/{id}/test", s.handleTestMCPServer)

			// Lists available workspace runtime plugins (metadata only — no workspace access).
			r.Get("/runtimes", s.handleListWorkspaceRuntimes)
		})
	})

	// Custom-domain routing: a request whose Host is an attached custom domain (forwarded here
	// by the reverse proxy) matches no route above, so the NotFound handler resolves it to the
	// mapped project's deployment. Non-custom-domain misses still return the ordinary 404.
	r.NotFound(s.handleCustomDomainProxy)
	// Host-mode previews: requests for <projectID>.<PreviewDomain> bypass the normal
	// routing tree and serve the workspace app at "/" on its own origin (wildcard DNS +
	// TLS terminate at the front proxy). Everything else falls through to the router.
	if s.cfg.PreviewDomain != "" {
		router := r
		suffix := "." + s.cfg.PreviewDomain
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			host := req.Host
			if i := strings.IndexByte(host, ':'); i >= 0 {
				host = host[:i]
			}
			if strings.HasSuffix(host, suffix) {
				s.handleHostPreview(w, req)
				return
			}
			router.ServeHTTP(w, req)
		})
	}
	return r
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"status":    "ok",
		"service":   "torsor-control-plane",
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	})
}

func (s *Server) handleReady(w http.ResponseWriter, r *http.Request) {
	dbOK := db.Healthy(r.Context(), s.pool)
	redisOK := s.redis.Healthy(r.Context())
	ready := dbOK && redisOK
	status := http.StatusOK
	label := "ready"
	if !ready {
		status = http.StatusServiceUnavailable
		label = "degraded"
	}
	writeJSON(w, status, map[string]any{
		"status":    label,
		"timestamp": time.Now().UTC().Format(time.RFC3339),
		"dependencies": map[string]bool{
			"database": dbOK,
			"redis":    redisOK,
		},
	})
}

func (s *Server) handleRoot(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"name":    "torsor-control-plane",
		"version": "v1",
		"appUrl":  s.cfg.AppURL,
		"endpoints": map[string]string{
			"health":   "/health",
			"ready":    "/ready",
			"auth":     "/api/v1/auth",
			"projects": "/api/v1/projects",
			"tasks":    "/api/v1/tasks",
			"config":   "/api/v1/config",
		},
	})
}

func (s *Server) handleConfig(w http.ResponseWriter, _ *http.Request) {
	payload := map[string]any{
		"appUrl":        s.cfg.AppURL,
		"apiUrl":        s.cfg.APIURL,
		"previewDomain": s.cfg.PreviewDomain,
		"features": map[string]string{
			"auth":           "jwt-password",
			"projects":       "db-backed",
			"files":          "db-backed",
			"backgroundJobs": "skeleton",
		},
		"domain": map[string]string{
			"app":     "app.torsor.dev",
			"landing": "torsor.dev",
			"note":    "App traffic should target app.torsor.dev and leave torsor.dev landing untouched.",
		},
	}
	if s.cfg.IsDevelopment() {
		payload["devSeedUser"] = map[string]string{
			"email":    s.cfg.DevSeedEmail,
			"password": s.cfg.DevSeedPassword,
		}
	}
	writeJSON(w, http.StatusOK, payload)
}

// --- middleware ---

func (s *Server) securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "SAMEORIGIN")
		h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		next.ServeHTTP(w, r)
	})
}

func (s *Server) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		allowed := ""
		if len(s.cfg.CORSOrigins) == 0 {
			// No CORS_ORIGIN configured: the intended topology is same-origin (nginx
			// proxies /api to this service), so cross-origin is denied by default. Only
			// explicit development reflects the request origin for convenience.
			if s.cfg.IsDevelopment() {
				allowed = origin
			}
		} else {
			for _, o := range s.cfg.CORSOrigins {
				if o == origin {
					allowed = o
					break
				}
			}
		}
		if allowed != "" {
			w.Header().Set("Access-Control-Allow-Origin", allowed)
			w.Header().Add("Vary", "Origin")
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) bodyLimit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Body != nil {
			r.Body = http.MaxBytesReader(w, r.Body, s.cfg.JSONBodyLimit)
		}
		next.ServeHTTP(w, r)
	})
}

// --- shared helpers ---

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func decodeJSON(r *http.Request, dst any) error {
	return json.NewDecoder(r.Body).Decode(dst)
}
