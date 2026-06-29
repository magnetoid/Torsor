package server

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/magnetoid/torsor/control-plane/internal/auth"
)

var roleRank = map[auth.Role]int{auth.RoleUser: 0, auth.RoleAdmin: 1, auth.RoleSuperAdmin: 2}

// requireRole gates a route on the caller's effective role (DB role + SUPER_ADMIN_EMAILS).
// Must run after auth.Require, which populates the claims in context. Returns 403 when the
// caller's rank is below the minimum.
func (s *Server) requireRole(minimum auth.Role) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			claims, ok := auth.FromContext(r.Context())
			if !ok {
				writeError(w, http.StatusUnauthorized, "Authentication required")
				return
			}
			u, err := s.auth.SanitizeUserByID(r.Context(), claims.UserID)
			if err != nil {
				s.fail(w, r, err)
				return
			}
			if u == nil {
				writeError(w, http.StatusUnauthorized, "Authentication required")
				return
			}
			if roleRank[s.resolveRole(u.Email, u.Role)] < roleRank[minimum] {
				writeError(w, http.StatusForbidden, "Forbidden: insufficient role")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

type adminStatsTotals struct {
	Users          int `json:"users"`
	Projects       int `json:"projects"`
	Files          int `json:"files"`
	ActiveSessions int `json:"activeSessions"`
	Tasks          int `json:"tasks"`
}

type adminStats struct {
	Totals        adminStatsTotals `json:"totals"`
	TasksByStatus map[string]int   `json:"tasksByStatus"`
	Growth        struct {
		NewUsers7d    int `json:"newUsers7d"`
		NewProjects7d int `json:"newProjects7d"`
	} `json:"growth"`
}

func (s *Server) handleAdminStats(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	var stats adminStats
	stats.TasksByStatus = map[string]int{}

	scalar := func(sql string) (int, error) {
		var n int
		err := s.pool.QueryRow(ctx, sql).Scan(&n)
		return n, err
	}

	var err error
	if stats.Totals.Users, err = scalar(`SELECT COUNT(*)::int FROM users`); err != nil {
		s.fail(w, r, err)
		return
	}
	if stats.Totals.Projects, err = scalar(`SELECT COUNT(*)::int FROM projects`); err != nil {
		s.fail(w, r, err)
		return
	}
	if stats.Totals.Files, err = scalar(`SELECT COUNT(*)::int FROM project_files`); err != nil {
		s.fail(w, r, err)
		return
	}
	if stats.Totals.ActiveSessions, err = scalar(`SELECT COUNT(*)::int FROM sessions WHERE expires_at > NOW()`); err != nil {
		s.fail(w, r, err)
		return
	}
	if stats.Growth.NewUsers7d, err = scalar(`SELECT COUNT(*)::int FROM users WHERE created_at > NOW() - INTERVAL '7 days'`); err != nil {
		s.fail(w, r, err)
		return
	}
	if stats.Growth.NewProjects7d, err = scalar(`SELECT COUNT(*)::int FROM projects WHERE created_at > NOW() - INTERVAL '7 days'`); err != nil {
		s.fail(w, r, err)
		return
	}

	rows, err := s.pool.Query(ctx, `SELECT status, COUNT(*)::int FROM ai_tasks GROUP BY status`)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var status string
		var c int
		if err := rows.Scan(&status, &c); err != nil {
			s.fail(w, r, err)
			return
		}
		stats.TasksByStatus[status] = c
		stats.Totals.Tasks += c
	}
	if err := rows.Err(); err != nil {
		s.fail(w, r, err)
		return
	}

	writeJSON(w, http.StatusOK, stats)
}

type adminUser struct {
	ID           string     `json:"id"`
	Email        string     `json:"email"`
	Username     string     `json:"username"`
	Role         auth.Role  `json:"role"`
	AvatarURL    *string    `json:"avatarUrl"`
	ProjectCount int        `json:"projectCount"`
	LastActiveAt *time.Time `json:"lastActiveAt"`
	CreatedAt    time.Time  `json:"createdAt"`
}

func (s *Server) handleAdminUsers(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	search := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("search")))
	limit := clampInt(r.URL.Query().Get("limit"), 50, 1, 200)
	offset := clampInt(r.URL.Query().Get("offset"), 0, 0, 1<<31-1)

	base := `SELECT u.id, u.email, u.username, u.role, u.avatar_url, u.created_at,
		COUNT(p.id)::int AS project_count,
		(SELECT MAX(sn.created_at) FROM sessions sn WHERE sn.user_id = u.id) AS last_active_at
		FROM users u LEFT JOIN projects p ON p.user_id = u.id `

	var (
		rows  pgx.Rows
		total int
		err   error
	)

	if search != "" {
		pat := "%" + search + "%"
		rows, err = s.pool.Query(ctx,
			base+`WHERE LOWER(u.email) LIKE $1 OR LOWER(u.username) LIKE $1
			 GROUP BY u.id ORDER BY u.created_at DESC LIMIT $2 OFFSET $3`, pat, limit, offset)
		if err == nil {
			defer rows.Close()
			err = s.pool.QueryRow(ctx,
				`SELECT COUNT(*)::int FROM users u WHERE LOWER(u.email) LIKE $1 OR LOWER(u.username) LIKE $1`, pat).Scan(&total)
		}
	} else {
		rows, err = s.pool.Query(ctx,
			base+`GROUP BY u.id ORDER BY u.created_at DESC LIMIT $1 OFFSET $2`, limit, offset)
		if err == nil {
			defer rows.Close()
			err = s.pool.QueryRow(ctx, `SELECT COUNT(*)::int FROM users`).Scan(&total)
		}
	}
	if err != nil {
		s.fail(w, r, err)
		return
	}

	items := []adminUser{}
	for rows.Next() {
		var u adminUser
		var role *string
		if err := rows.Scan(&u.ID, &u.Email, &u.Username, &role, &u.AvatarURL, &u.CreatedAt, &u.ProjectCount, &u.LastActiveAt); err != nil {
			s.fail(w, r, err)
			return
		}
		dbRole := auth.RoleUser
		if role != nil {
			dbRole = auth.Role(*role)
		}
		u.Role = s.resolveRole(u.Email, dbRole)
		items = append(items, u)
	}
	if err := rows.Err(); err != nil {
		s.fail(w, r, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"items":  items,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

func (s *Server) handleAdminUpdateUserRole(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "userID")
	var body struct {
		Role string `json:"role"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	switch auth.Role(body.Role) {
	case auth.RoleUser, auth.RoleAdmin, auth.RoleSuperAdmin:
	default:
		writeError(w, http.StatusBadRequest, "role must be one of user, admin, super_admin")
		return
	}

	// Guard against a super-admin accidentally locking themselves out.
	if claims, ok := auth.FromContext(r.Context()); ok && claims.UserID == userID && body.Role != string(auth.RoleSuperAdmin) {
		writeError(w, http.StatusBadRequest, "You cannot remove your own super_admin role")
		return
	}

	var (
		id, email, username, role string
		createdAt                 time.Time
	)
	err := s.pool.QueryRow(r.Context(),
		`UPDATE users SET role = $2, updated_at = NOW() WHERE id = $1
		 RETURNING id, email, username, role, created_at`, userID, body.Role,
	).Scan(&id, &email, &username, &role, &createdAt)
	if err == pgx.ErrNoRows {
		writeError(w, http.StatusNotFound, "User not found")
		return
	}
	if err != nil {
		s.fail(w, r, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"id":        id,
		"email":     email,
		"username":  username,
		"role":      s.resolveRole(email, auth.Role(role)),
		"createdAt": createdAt,
	})
}

func clampInt(raw string, def, lo, hi int) int {
	n, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil {
		n = def
	}
	if n < lo {
		return lo
	}
	if n > hi {
		return hi
	}
	return n
}
