package server

import (
	"errors"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
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
	// Verification state. The client needs all three to render "add this record, then click
	// Verify" without a second round trip.
	Verified   bool       `json:"verified"`
	VerifiedAt *time.Time `json:"verifiedAt"`
	RecordName string     `json:"recordName"`
	RecordType string     `json:"recordType"`
	//nolint:revive // the token is the challenge value, safe to show to the domain's owner.
	RecordValue string `json:"recordValue"`
}

// withChallenge fills the DNS instructions from the row's token. The token is only ever
// returned to a caller who already passed the project-ownership check, so showing it is not a
// disclosure — it is the whole point.
func (d *customDomain) withChallenge(token string, verifiedAt *time.Time) {
	d.RecordType = "TXT"
	d.RecordName = challengeHost(d.Domain)
	d.RecordValue = token
	d.VerifiedAt = verifiedAt
	d.Verified = verifiedAt != nil
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
		`SELECT id, project_id, domain, created_at, verification_token, verified_at
		   FROM custom_domains WHERE project_id = $1 ORDER BY created_at DESC`, projectID)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	defer rows.Close()
	items := []customDomain{}
	for rows.Next() {
		var d customDomain
		var token string
		var verifiedAt *time.Time
		if err := rows.Scan(&d.ID, &d.ProjectID, &d.Domain, &d.CreatedAt, &token, &verifiedAt); err != nil {
			s.fail(w, r, err)
			return
		}
		d.withChallenge(token, verifiedAt)
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
	token, err := newVerificationToken()
	if err != nil {
		s.fail(w, r, err)
		return
	}
	var d customDomain
	err = s.pool.QueryRow(r.Context(),
		`INSERT INTO custom_domains (project_id, user_id, domain, verification_token)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, project_id, domain, created_at`,
		projectID, userID(r), domain, token).Scan(&d.ID, &d.ProjectID, &d.Domain, &d.CreatedAt)
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
	d.withChallenge(token, nil)
	s.auditFromRequest(r, "domain_add", "project", projectID, domain, "Attached domain "+domain+" (unverified)")
	writeJSON(w, http.StatusCreated, d)
}

// handleVerifyDomain checks the DNS TXT challenge and, on success, makes the domain routable.
// Verification is idempotent and re-runnable: DNS propagation means the first few attempts
// routinely fail, so a failure is a normal state to report, not an error to log as a fault.
func (s *Server) handleVerifyDomain(w http.ResponseWriter, r *http.Request) {
	projectID, ok := s.requireOwnedProject(w, r)
	if !ok {
		return
	}
	domainID := chi.URLParam(r, "domainID")

	var d customDomain
	var token string
	var verifiedAt *time.Time
	err := s.pool.QueryRow(r.Context(),
		`SELECT id, project_id, domain, created_at, verification_token, verified_at
		   FROM custom_domains WHERE id = $1 AND project_id = $2`, domainID, projectID,
	).Scan(&d.ID, &d.ProjectID, &d.Domain, &d.CreatedAt, &token, &verifiedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "Domain not found")
		return
	}
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if verifiedAt != nil {
		d.withChallenge(token, verifiedAt)
		writeJSON(w, http.StatusOK, map[string]any{"domain": d, "verified": true})
		return
	}

	okTXT, lookupErr := verifyDomainTXT(r.Context(), s.resolver(), d.Domain, token)
	if !okTXT {
		// Say which failure it was. "We couldn't find the record" and "we found it but it
		// didn't match" send the user to completely different fixes.
		reason := "No matching TXT record yet. DNS changes can take a few minutes to propagate."
		if lookupErr != nil {
			reason = "Could not read DNS for " + challengeHost(d.Domain) + ": " + lookupErr.Error()
		}
		d.withChallenge(token, nil)
		writeJSON(w, http.StatusOK, map[string]any{"domain": d, "verified": false, "reason": reason})
		return
	}

	var now time.Time
	if err := s.pool.QueryRow(r.Context(),
		`UPDATE custom_domains SET verified_at = NOW() WHERE id = $1 AND project_id = $2
		 RETURNING verified_at`, domainID, projectID).Scan(&now); err != nil {
		s.fail(w, r, err)
		return
	}
	d.withChallenge(token, &now)
	s.auditFromRequest(r, "domain_verify", "project", projectID, d.Domain, "Verified domain "+d.Domain)
	writeJSON(w, http.StatusOK, map[string]any{"domain": d, "verified": true})
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
