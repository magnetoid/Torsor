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

// --- Admin / super-admin platform dashboard (1:1 port of apps/api) ---

var roleRank = map[auth.Role]int{auth.RoleUser: 0, auth.RoleAdmin: 1, auth.RoleSuperAdmin: 2}

// requireRole gates a route on the caller's effective role (DB role + SUPER_ADMIN_EMAILS).
// Must run inside the auth.Require group. Mirrors apps/api requireRole: 401 when the user
// row is gone, 403 when the caller's rank is below the minimum.
func (s *Server) requireRole(minimum auth.Role) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user, err := s.auth.SanitizeUserByID(r.Context(), userID(r))
			if err != nil {
				s.fail(w, r, err)
				return
			}
			if user == nil {
				writeError(w, http.StatusUnauthorized, "Authentication required")
				return
			}
			role := s.resolveRole(user.Email, user.Role)
			if roleRank[role] < roleRank[minimum] {
				writeError(w, http.StatusForbidden, "Forbidden: insufficient role")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func (s *Server) handleAdminStats(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	count := func(sql string) (int, error) {
		var c int
		err := s.pool.QueryRow(ctx, sql).Scan(&c)
		return c, err
	}

	users, err := count(`SELECT COUNT(*)::int FROM users`)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	projects, err := count(`SELECT COUNT(*)::int FROM projects`)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	files, err := count(`SELECT COUNT(*)::int FROM project_files`)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	activeSessions, err := count(`SELECT COUNT(*)::int FROM sessions WHERE expires_at > NOW()`)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	newUsers7d, err := count(`SELECT COUNT(*)::int FROM users WHERE created_at > NOW() - INTERVAL '7 days'`)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	newProjects7d, err := count(`SELECT COUNT(*)::int FROM projects WHERE created_at > NOW() - INTERVAL '7 days'`)
	if err != nil {
		s.fail(w, r, err)
		return
	}

	rows, err := s.pool.Query(ctx, `SELECT status, COUNT(*)::int FROM ai_tasks GROUP BY status`)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	defer rows.Close()
	tasksByStatus := map[string]int{}
	totalTasks := 0
	for rows.Next() {
		var status string
		var c int
		if err := rows.Scan(&status, &c); err != nil {
			s.fail(w, r, err)
			return
		}
		tasksByStatus[status] = c
		totalTasks += c
	}
	if err := rows.Err(); err != nil {
		s.fail(w, r, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"totals": map[string]any{
			"users":          users,
			"projects":       projects,
			"files":          files,
			"activeSessions": activeSessions,
			"tasks":          totalTasks,
		},
		"tasksByStatus": tasksByStatus,
		"growth": map[string]any{
			"newUsers7d":    newUsers7d,
			"newProjects7d": newProjects7d,
		},
	})
}

func (s *Server) handleAdminUsers(w http.ResponseWriter, r *http.Request) {
	search := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("search")))
	limit := clampInt(r.URL.Query().Get("limit"), 50, 1, 200)
	offset := clampInt(r.URL.Query().Get("offset"), 0, 0, 1<<30)

	where := ""
	filterParams := []any{}
	if search != "" {
		filterParams = append(filterParams, "%"+search+"%")
		where = `WHERE LOWER(u.email) LIKE $1 OR LOWER(u.username) LIKE $1`
	}

	listParams := append(append([]any{}, filterParams...), limit, offset)
	listSQL := `SELECT u.id, u.email, u.username, u.role, u.avatar_url, u.created_at,
	                   COUNT(p.id)::int AS project_count,
	                   (SELECT MAX(s.created_at) FROM sessions s WHERE s.user_id = u.id) AS last_active_at
	            FROM users u
	            LEFT JOIN projects p ON p.user_id = u.id
	            ` + where + `
	            GROUP BY u.id
	            ORDER BY u.created_at DESC
	            LIMIT $` + strconv.Itoa(len(listParams)-1) + ` OFFSET $` + strconv.Itoa(len(listParams))

	rows, err := s.pool.Query(r.Context(), listSQL, listParams...)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	defer rows.Close()

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

	var total int
	if err := s.pool.QueryRow(r.Context(), `SELECT COUNT(*)::int FROM users u `+where, filterParams...).Scan(&total); err != nil {
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
	targetID := chi.URLParam(r, "userID")
	var body struct {
		Role string `json:"role"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	role := auth.Role(body.Role)
	if _, ok := roleRank[role]; !ok || body.Role == "" {
		writeError(w, http.StatusBadRequest, "role must be one of user, admin, super_admin")
		return
	}
	// Guard against a super-admin accidentally locking themselves out.
	if targetID == userID(r) && role != auth.RoleSuperAdmin {
		writeError(w, http.StatusBadRequest, "You cannot remove your own super_admin role")
		return
	}

	var (
		id, email, username string
		dbRole              *string
		createdAt           time.Time
	)
	err := s.pool.QueryRow(r.Context(),
		`UPDATE users SET role = $2, updated_at = NOW()
		 WHERE id = $1
		 RETURNING id, email, username, role, created_at`,
		targetID, string(role)).Scan(&id, &email, &username, &dbRole, &createdAt)
	if err == pgx.ErrNoRows {
		writeError(w, http.StatusNotFound, "User not found")
		return
	}
	if err != nil {
		s.fail(w, r, err)
		return
	}

	effective := auth.RoleUser
	if dbRole != nil {
		effective = auth.Role(*dbRole)
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"id":        id,
		"email":     email,
		"username":  username,
		"role":      s.resolveRole(email, effective),
		"createdAt": createdAt,
	})
}

// clampInt parses s (default def) and clamps it to [min, max] — mirrors the
// parseInt/min/max handling of the Express admin users route.
func clampInt(s string, def, min, max int) int {
	n, err := strconv.Atoi(s)
	if err != nil || s == "" {
		n = def
	}
	if n < min {
		return min
	}
	if n > max {
		return max
	}
	return n
}
