package server

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/magnetoid/torsor/control-plane/internal/agent"
	"github.com/magnetoid/torsor/control-plane/internal/mcpx"
	"github.com/magnetoid/torsor/control-plane/internal/secrets"
)

// MCP servers: user-configured Model Context Protocol endpoints whose tools the coding agent
// can call. Every route is scoped to the caller's user_id; the auth header is stored
// encrypted and never returned (write-only, like BYO model keys).

type mcpServerDTO struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	URL       string    `json:"url"`
	Transport string    `json:"transport"`
	HasAuth   bool      `json:"hasAuth"`
	Enabled   bool      `json:"enabled"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func validTransport(t string) bool {
	return t == "streamable-http" || t == "sse"
}

func (s *Server) handleListMCPServers(w http.ResponseWriter, r *http.Request) {
	rows, err := s.pool.Query(r.Context(),
		`SELECT id, name, url, transport, (auth_header_enc IS NOT NULL), enabled, created_at, updated_at
		   FROM mcp_servers WHERE user_id = $1 ORDER BY name`, userID(r))
	if err != nil {
		s.fail(w, r, err)
		return
	}
	defer rows.Close()

	items := []mcpServerDTO{}
	for rows.Next() {
		var d mcpServerDTO
		if err := rows.Scan(&d.ID, &d.Name, &d.URL, &d.Transport, &d.HasAuth, &d.Enabled, &d.CreatedAt, &d.UpdatedAt); err != nil {
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

func (s *Server) handleCreateMCPServer(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name       string `json:"name"`
		URL        string `json:"url"`
		Transport  string `json:"transport"`
		AuthHeader string `json:"authHeader"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	body.Name = strings.TrimSpace(body.Name)
	body.URL = strings.TrimSpace(body.URL)
	if body.Name == "" || body.URL == "" {
		writeError(w, http.StatusBadRequest, "name and url are required")
		return
	}
	if body.Transport == "" {
		body.Transport = "streamable-http"
	}
	if !validTransport(body.Transport) {
		writeError(w, http.StatusBadRequest, "transport must be 'streamable-http' or 'sse'")
		return
	}

	var enc any // NULL unless an auth header is provided
	if strings.TrimSpace(body.AuthHeader) != "" {
		e, ok := s.encryptOrError(w, r, body.AuthHeader)
		if !ok {
			return
		}
		enc = e
	}

	var d mcpServerDTO
	err := s.pool.QueryRow(r.Context(),
		`INSERT INTO mcp_servers (user_id, name, url, transport, auth_header_enc)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, name, url, transport, (auth_header_enc IS NOT NULL), enabled, created_at, updated_at`,
		userID(r), body.Name, body.URL, body.Transport, enc).
		Scan(&d.ID, &d.Name, &d.URL, &d.Transport, &d.HasAuth, &d.Enabled, &d.CreatedAt, &d.UpdatedAt)
	if err != nil {
		if strings.Contains(err.Error(), "mcp_servers_user_id_name_key") || strings.Contains(err.Error(), "duplicate key") {
			writeError(w, http.StatusConflict, "An MCP server with that name already exists")
			return
		}
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, d)
}

func (s *Server) handleUpdateMCPServer(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body struct {
		URL        *string `json:"url"`
		Transport  *string `json:"transport"`
		Enabled    *bool   `json:"enabled"`
		AuthHeader *string `json:"authHeader"` // "" clears, non-empty replaces, omitted keeps
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if body.Transport != nil && !validTransport(*body.Transport) {
		writeError(w, http.StatusBadRequest, "transport must be 'streamable-http' or 'sse'")
		return
	}

	// Apply provided fields via COALESCE; the auth header is handled explicitly (clear vs set).
	var (
		urlArg, transportArg any
		enabledArg           any
	)
	if body.URL != nil {
		urlArg = strings.TrimSpace(*body.URL)
	}
	if body.Transport != nil {
		transportArg = *body.Transport
	}
	if body.Enabled != nil {
		enabledArg = *body.Enabled
	}

	// auth header: nil => keep (sentinel handled in SQL), "" => clear, value => encrypt+set.
	setAuth := false
	var authArg any
	if body.AuthHeader != nil {
		setAuth = true
		if strings.TrimSpace(*body.AuthHeader) == "" {
			authArg = nil
		} else {
			e, ok := s.encryptOrError(w, r, *body.AuthHeader)
			if !ok {
				return
			}
			authArg = e
		}
	}

	tag, err := s.pool.Exec(r.Context(),
		`UPDATE mcp_servers
		    SET url        = COALESCE($3, url),
		        transport  = COALESCE($4, transport),
		        enabled    = COALESCE($5, enabled),
		        auth_header_enc = CASE WHEN $6 THEN $7 ELSE auth_header_enc END,
		        updated_at = NOW()
		  WHERE id = $1 AND user_id = $2`,
		id, userID(r), urlArg, transportArg, enabledArg, setAuth, authArg)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "MCP server not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

func (s *Server) handleDeleteMCPServer(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	tag, err := s.pool.Exec(r.Context(),
		`DELETE FROM mcp_servers WHERE id = $1 AND user_id = $2`, id, userID(r))
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "MCP server not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// handleTestMCPServer connects to a stored server and lists its tools, reporting reachability
// inline (200 with ok=false + error rather than an HTTP error, so the UI shows why it failed).
func (s *Server) handleTestMCPServer(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	server, ok, err := s.loadMCPServerByID(r.Context(), userID(r), id)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if !ok {
		writeError(w, http.StatusNotFound, "MCP server not found")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 25*time.Second)
	defer cancel()
	names, terr := mcpx.TestConnect(ctx, server)
	if terr != nil {
		writeJSON(w, http.StatusOK, map[string]any{"ok": false, "error": terr.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "tools": names, "toolCount": len(names)})
}

// encryptOrError encrypts a value, writing the appropriate error and returning ok=false when
// secret storage is disabled (no TORSOR_SECRET_KEY) or the cipher fails.
func (s *Server) encryptOrError(w http.ResponseWriter, r *http.Request, plaintext string) (string, bool) {
	cipher, err := s.secretCipher()
	if errors.Is(err, secrets.ErrDisabled) {
		writeError(w, http.StatusBadRequest, "Secret storage is disabled; set TORSOR_SECRET_KEY to store an auth header")
		return "", false
	}
	if err != nil {
		s.fail(w, r, err)
		return "", false
	}
	enc, err := cipher.Encrypt(plaintext)
	if err != nil {
		s.fail(w, r, err)
		return "", false
	}
	return enc, true
}

// loadMCPServerByID returns one owned server (with decrypted auth header) for the test route.
func (s *Server) loadMCPServerByID(ctx context.Context, uid, id string) (mcpx.Server, bool, error) {
	var name, url, transport string
	var enc *string
	err := s.pool.QueryRow(ctx,
		`SELECT name, url, transport, auth_header_enc FROM mcp_servers WHERE id = $1 AND user_id = $2`,
		id, uid).Scan(&name, &url, &transport, &enc)
	if err == pgx.ErrNoRows {
		return mcpx.Server{}, false, nil
	}
	if err != nil {
		return mcpx.Server{}, false, err
	}
	return mcpx.Server{Name: name, URL: url, Transport: transport, AuthHeader: s.decryptHeader(enc)}, true, nil
}

// decryptHeader best-effort decrypts a stored auth header; returns "" if absent or secrets
// are disabled/undecryptable (the server is then dialed without auth).
func (s *Server) decryptHeader(enc *string) string {
	if enc == nil {
		return ""
	}
	cipher, err := s.secretCipher()
	if err != nil {
		return ""
	}
	if dec, err := cipher.Decrypt(*enc); err == nil {
		return dec
	}
	return ""
}

// --- agent integration -------------------------------------------------------------------

// mcpToolRouter adapts a live mcpx.Router to the agent's ToolRouter contract.
type mcpToolRouter struct{ r *mcpx.Router }

func (m *mcpToolRouter) ExternalTools() []agent.ExternalTool {
	refs := m.r.Tools()
	out := make([]agent.ExternalTool, 0, len(refs))
	for _, t := range refs {
		out = append(out, agent.ExternalTool{Name: t.Qualified, Description: t.Description})
	}
	return out
}

func (m *mcpToolRouter) CallExternal(ctx context.Context, name string, args map[string]string) (string, error) {
	return m.r.Call(ctx, name, args)
}

// buildMCPRouter loads the user's enabled MCP servers, dials them, and returns a live router
// plus an agent.ToolRouter adapter. Returns (nil, nil) when the user has none reachable — the
// agent then runs with built-in tools only. The caller MUST Close the returned router.
func (s *Server) buildMCPRouter(ctx context.Context, uid string) (*mcpx.Router, agent.ToolRouter) {
	servers, err := s.loadEnabledMCPServers(ctx, uid)
	if err != nil {
		s.logger.Warn("load mcp servers failed", "err", err)
		return nil, nil
	}
	if len(servers) == 0 {
		return nil, nil
	}
	router := mcpx.Dial(ctx, servers)
	if len(router.Tools()) == 0 {
		router.Close()
		return nil, nil
	}
	return router, &mcpToolRouter{r: router}
}

// loadEnabledMCPServers returns the user's enabled servers with decrypted auth headers.
func (s *Server) loadEnabledMCPServers(ctx context.Context, uid string) ([]mcpx.Server, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT name, url, transport, auth_header_enc FROM mcp_servers WHERE user_id = $1 AND enabled = TRUE`, uid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []mcpx.Server
	for rows.Next() {
		var name, url, transport string
		var enc *string
		if err := rows.Scan(&name, &url, &transport, &enc); err != nil {
			return nil, err
		}
		out = append(out, mcpx.Server{Name: name, URL: url, Transport: transport, AuthHeader: s.decryptHeader(enc)})
	}
	return out, rows.Err()
}
