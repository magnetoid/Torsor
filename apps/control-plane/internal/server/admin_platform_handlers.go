package server

import (
	"net/http"
	"time"
)

// Real super-admin observability + settings, replacing the fabricated admin dashboards.
// Everything here reflects actual DB/runtime state; fields that would need request telemetry
// Torsor doesn't collect yet (per-model latency, error rate) are intentionally absent rather
// than faked — see the observability roadmap.

// handleAdminWorkspaces lists runtime workspaces across all users (super-admin only).
func (s *Server) handleAdminWorkspaces(w http.ResponseWriter, r *http.Request) {
	rows, err := s.pool.Query(r.Context(),
		`SELECT w.id, w.status, w.runtime, u.email, p.name, w.created_at
		   FROM workspaces w
		   JOIN users u ON u.id = w.user_id
		   JOIN projects p ON p.id = w.project_id
		  ORDER BY w.updated_at DESC LIMIT 200`)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var id, status, runtime, email, project string
		var created time.Time
		if err := rows.Scan(&id, &status, &runtime, &email, &project, &created); err != nil {
			s.fail(w, r, err)
			return
		}
		items = append(items, map[string]any{
			"id": id, "status": status, "runtime": runtime,
			"owner": email, "project": project, "createdAt": created,
		})
	}
	if err := rows.Err(); err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

// handleAdminPlatform returns real platform stats: loaded model providers, workspace counts
// by status, and usage token/cost totals + a per-provider breakdown.
func (s *Server) handleAdminPlatform(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	providers := []string{}
	for _, info := range s.host.ModelProviders() {
		providers = append(providers, info.Name)
	}

	wsByStatus := map[string]int{}
	wsTotal := 0
	if rows, err := s.pool.Query(ctx, `SELECT status, COUNT(*)::int FROM workspaces GROUP BY status`); err == nil {
		for rows.Next() {
			var st string
			var c int
			if rows.Scan(&st, &c) == nil {
				wsByStatus[st] = c
				wsTotal += c
			}
		}
		rows.Close()
	}

	var tokensIn, tokensOut int64
	_ = s.pool.QueryRow(ctx,
		`SELECT COALESCE(SUM(tokens_in),0), COALESCE(SUM(tokens_out),0) FROM usage_events`).Scan(&tokensIn, &tokensOut)

	usageByProvider := []map[string]any{}
	if rows, err := s.pool.Query(ctx,
		`SELECT provider, COALESCE(SUM(tokens_in),0), COALESCE(SUM(tokens_out),0), COUNT(*)::int
		   FROM usage_events GROUP BY provider ORDER BY SUM(tokens_in)+SUM(tokens_out) DESC`); err == nil {
		for rows.Next() {
			var provider string
			var tin, tout int64
			var calls int
			if rows.Scan(&provider, &tin, &tout, &calls) == nil {
				usageByProvider = append(usageByProvider, map[string]any{
					"provider": provider, "tokensIn": tin, "tokensOut": tout, "calls": calls,
				})
			}
		}
		rows.Close()
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"providers":       providers,
		"workspaces":      map[string]any{"total": wsTotal, "byStatus": wsByStatus},
		"usageTotals":     map[string]any{"tokensIn": tokensIn, "tokensOut": tokensOut},
		"usageByProvider": usageByProvider,
	})
}

type platformSettings struct {
	MaintenanceMode bool   `json:"maintenanceMode"`
	Announcement    string `json:"announcement"`
}

func (s *Server) handleGetPlatformSettings(w http.ResponseWriter, r *http.Request) {
	var ps platformSettings
	_ = s.pool.QueryRow(r.Context(),
		`SELECT maintenance_mode, announcement FROM platform_settings WHERE id = TRUE`).
		Scan(&ps.MaintenanceMode, &ps.Announcement)
	writeJSON(w, http.StatusOK, ps)
}

func (s *Server) handleUpdatePlatformSettings(w http.ResponseWriter, r *http.Request) {
	var b platformSettings
	if err := decodeJSON(r, &b); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if _, err := s.pool.Exec(r.Context(),
		`UPDATE platform_settings SET maintenance_mode = $1, announcement = $2, updated_at = NOW() WHERE id = TRUE`,
		b.MaintenanceMode, b.Announcement); err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, b)
}
