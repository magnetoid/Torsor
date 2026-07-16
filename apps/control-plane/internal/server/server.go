// Package server wires the HTTP API. Routes and JSON shapes mirror the legacy
// apps/api Express service 1:1 so the existing frontend works unchanged.
package server

import (
	"encoding/json"
	"log/slog"
	"net/http"
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
)

type Server struct {
	cfg    config.Config
	pool   *pgxpool.Pool
	redis  *redisx.Client
	auth   *auth.Manager
	host   *plugin.Host
	logger *slog.Logger
}

func New(cfg config.Config, pool *pgxpool.Pool, rc *redisx.Client, am *auth.Manager, host *plugin.Host, logger *slog.Logger) *Server {
	return &Server{cfg: cfg, pool: pool, redis: rc, auth: am, host: host, logger: logger}
}

// Handler builds the chi router with all middleware and routes.
func (s *Server) Handler() http.Handler {
	r := chi.NewRouter()
	r.Use(chimw.RequestID)
	r.Use(chimw.RealIP)
	r.Use(chimw.Recoverer)
	r.Use(s.securityHeaders)
	r.Use(s.cors)
	r.Use(s.bodyLimit)

	r.Get("/health", s.handleHealth)
	r.Get("/ready", s.handleReady)

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

			r.Get("/projects", s.handleListProjects)
			r.Post("/projects", s.handleCreateProject)
			r.Get("/projects/{projectID}", s.handleGetProject)
			r.Patch("/projects/{projectID}", s.handleUpdateProject)
			r.Delete("/projects/{projectID}", s.handleDeleteProject)
			r.Get("/projects/{projectID}/files", s.handleListFiles)
			r.Post("/projects/{projectID}/files", s.handleUpsertFile)
			r.Patch("/projects/{projectID}/files/{fileID}", s.handleUpdateFile)
			r.Delete("/projects/{projectID}/files/{fileID}", s.handleDeleteFile)

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
			})

			// Project workspace (WorkspaceRuntime capability), scoped to project ownership:
			// the runtime workspace id is the project id, never a client-supplied value.
			r.Post("/projects/{projectID}/workspace", s.handleCreateProjectWorkspace)
			r.Get("/projects/{projectID}/workspace", s.handleGetProjectWorkspace)
			r.Post("/projects/{projectID}/workspace/start", s.handleStartProjectWorkspace)
			r.Post("/projects/{projectID}/workspace/stop", s.handleStopProjectWorkspace)
			r.Post("/projects/{projectID}/workspace/destroy", s.handleDestroyProjectWorkspace)
			r.Post("/projects/{projectID}/workspace/exec/stream", s.handleExecProjectWorkspace)
			r.Get("/projects/{projectID}/workspace/files", s.handleListProjectWorkspaceFiles)
			r.Get("/projects/{projectID}/workspace/file", s.handleReadProjectWorkspaceFile)
			r.Post("/projects/{projectID}/workspace/file", s.handleWriteProjectWorkspaceFile)

			// Checkpoints: file-tree snapshots for restore/rollback (ownership-scoped).
			r.Get("/projects/{projectID}/checkpoints", s.handleListCheckpoints)
			r.Post("/projects/{projectID}/checkpoints", s.handleCreateCheckpoint)
			r.Post("/projects/{projectID}/checkpoints/{checkpointID}/restore", s.handleRestoreCheckpoint)

			// Deploy: expose the project's running workspace app at a stable public URL
			// (/d/{projectID}/, served by handleDeployProxy below). Owner-only controls.
			r.Post("/projects/{projectID}/deploy", s.handleDeploy)
			r.Get("/projects/{projectID}/deployment", s.handleGetDeployment)
			r.Post("/projects/{projectID}/deployment/stop", s.handleStopDeployment)

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
			r.Post("/providers/models/{name}/complete", s.handleComplete)
			r.Post("/providers/models/{name}/complete/stream", s.handleCompleteSSE)

			// Lists available workspace runtime plugins (metadata only — no workspace access).
			r.Get("/runtimes", s.handleListWorkspaceRuntimes)
		})
	})

	r.NotFound(func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Not Found", "path": r.URL.Path})
	})
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
		"appUrl": s.cfg.AppURL,
		"apiUrl": s.cfg.APIURL,
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
