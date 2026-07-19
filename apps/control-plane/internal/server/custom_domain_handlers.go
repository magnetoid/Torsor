package server

import (
	"errors"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// Custom domains — map a user-owned hostname to a project's deployment. The app stores and
// validates the mapping and routes requests by Host (see handleCustomDomainProxy); DNS and TLS
// for the domain are configured at the reverse-proxy/infra layer, not here. Ownership-scoped.

type customDomain struct {
	ID        string    `json:"id"`
	ProjectID string    `json:"projectId"`
	Domain    string    `json:"domain"`
	CreatedAt time.Time `json:"createdAt"`
}

// domainPattern accepts a bare hostname (labels of a–z/0–9/hyphen, a dotted TLD). No scheme,
// port, or path — this is a host, not a URL.
var domainPattern = regexp.MustCompile(`^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$`)

func normalizeDomain(d string) string {
	d = strings.TrimSpace(strings.ToLower(d))
	d = strings.TrimPrefix(d, "http://")
	d = strings.TrimPrefix(d, "https://")
	d = strings.TrimSuffix(d, "/")
	return d
}

func (s *Server) handleListDomains(w http.ResponseWriter, r *http.Request) {
	projectID, ok := s.requireOwnedProject(w, r)
	if !ok {
		return
	}
	rows, err := s.pool.Query(r.Context(),
		`SELECT id, project_id, domain, created_at FROM custom_domains
		  WHERE project_id = $1 ORDER BY created_at DESC`, projectID)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	defer rows.Close()
	items := []customDomain{}
	for rows.Next() {
		var d customDomain
		if err := rows.Scan(&d.ID, &d.ProjectID, &d.Domain, &d.CreatedAt); err != nil {
			s.fail(w, r, err)
			return
		}
		items = append(items, d)
	}
	if err := rows.Err(); err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (s *Server) handleAddDomain(w http.ResponseWriter, r *http.Request) {
	projectID, ok := s.requireOwnedProject(w, r)
	if !ok {
		return
	}
	var body struct {
		Domain string `json:"domain"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	domain := normalizeDomain(body.Domain)
	if !domainPattern.MatchString(domain) {
		writeError(w, http.StatusBadRequest, "Enter a valid domain, e.g. app.example.com")
		return
	}
	var d customDomain
	err := s.pool.QueryRow(r.Context(),
		`INSERT INTO custom_domains (project_id, user_id, domain) VALUES ($1, $2, $3)
		 RETURNING id, project_id, domain, created_at`,
		projectID, userID(r), domain).Scan(&d.ID, &d.ProjectID, &d.Domain, &d.CreatedAt)
	if err != nil {
		// A domain maps to exactly one project (UNIQUE) → 409 rather than a generic 500.
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			writeError(w, http.StatusConflict, "That domain is already attached to a project")
			return
		}
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, d)
}

func (s *Server) handleDeleteDomain(w http.ResponseWriter, r *http.Request) {
	projectID, ok := s.requireOwnedProject(w, r)
	if !ok {
		return
	}
	domainID := chi.URLParam(r, "domainID")
	tag, err := s.pool.Exec(r.Context(),
		`DELETE FROM custom_domains WHERE id = $1 AND project_id = $2`, domainID, projectID)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "Domain not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}
