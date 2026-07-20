package server

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/magnetoid/torsor/control-plane/internal/textsafe"
)

// Project memories — durable per-project facts/notes/decisions that persist across agent
// runs and IDE sessions (the vibe-coding "memory"). Every route is scoped to an owned
// project; the coding agent reads/writes the same table via projectMemoryStore so what the
// user curates and what the agent remembers are one store.

type memory struct {
	ID        string    `json:"id"`
	ProjectID string    `json:"projectId"`
	Kind      string    `json:"kind"`
	Content   string    `json:"content"`
	Source    string    `json:"source"` // "user" | "agent"
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

const memoryCols = `id, project_id, kind, content, source, created_at, updated_at`

// memoryKinds is the accepted set; anything else is normalized to "note" so a stray value
// can't create an unbounded taxonomy.
var memoryKinds = map[string]bool{"note": true, "fact": true, "decision": true, "preference": true}

func normalizeMemoryKind(k string) string {
	k = strings.TrimSpace(strings.ToLower(k))
	if memoryKinds[k] {
		return k
	}
	return "note"
}

func scanMemory(row pgx.Row) (memory, error) {
	var m memory
	err := row.Scan(&m.ID, &m.ProjectID, &m.Kind, &m.Content, &m.Source, &m.CreatedAt, &m.UpdatedAt)
	return m, err
}

func (s *Server) handleListMemories(w http.ResponseWriter, r *http.Request) {
	projectID, ok := s.requireOwnedProject(w, r)
	if !ok {
		return
	}
	// Optional ?q= substring filter (case-insensitive) so the UI search and the agent's
	// recall share the same query path.
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	var rows pgx.Rows
	var err error
	if q != "" {
		rows, err = s.pool.Query(r.Context(),
			`SELECT `+memoryCols+` FROM memories
			  WHERE project_id = $1 AND content ILIKE '%' || $2 || '%'
			  ORDER BY created_at DESC LIMIT 200`, projectID, q)
	} else {
		rows, err = s.pool.Query(r.Context(),
			`SELECT `+memoryCols+` FROM memories
			  WHERE project_id = $1
			  ORDER BY created_at DESC LIMIT 200`, projectID)
	}
	if err != nil {
		s.fail(w, r, err)
		return
	}
	defer rows.Close()

	items := []memory{}
	for rows.Next() {
		m, err := scanMemory(rows)
		if err != nil {
			s.fail(w, r, err)
			return
		}
		items = append(items, m)
	}
	if err := rows.Err(); err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (s *Server) handleCreateMemory(w http.ResponseWriter, r *http.Request) {
	projectID, ok := s.requireOwnedProject(w, r)
	if !ok {
		return
	}
	var body struct {
		Content string `json:"content"`
		Kind    string `json:"kind"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	content := strings.TrimSpace(body.Content)
	if content == "" {
		writeError(w, http.StatusBadRequest, "Memory content is required")
		return
	}
	m, err := scanMemory(s.pool.QueryRow(r.Context(),
		`INSERT INTO memories (project_id, user_id, kind, content, source)
		 VALUES ($1, $2, $3, $4, 'user') RETURNING `+memoryCols,
		projectID, userID(r), normalizeMemoryKind(body.Kind), content))
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, m)
}

func (s *Server) handleUpdateMemory(w http.ResponseWriter, r *http.Request) {
	projectID, ok := s.requireOwnedProject(w, r)
	if !ok {
		return
	}
	memoryID := chi.URLParam(r, "memoryID")
	var body struct {
		Content *string `json:"content"`
		Kind    *string `json:"kind"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	var content *string
	if body.Content != nil {
		c := strings.TrimSpace(*body.Content)
		if c == "" {
			writeError(w, http.StatusBadRequest, "Memory content cannot be empty")
			return
		}
		content = &c
	}
	var kind *string
	if body.Kind != nil {
		k := normalizeMemoryKind(*body.Kind)
		kind = &k
	}
	// COALESCE keeps the existing value when a field is omitted. Scoped by project so a
	// memory id from another project can't be touched (404 on miss).
	m, err := scanMemory(s.pool.QueryRow(r.Context(),
		`UPDATE memories
		    SET content = COALESCE($3, content),
		        kind = COALESCE($4, kind),
		        updated_at = NOW()
		  WHERE id = $1 AND project_id = $2
		  RETURNING `+memoryCols,
		memoryID, projectID, content, kind))
	if err == pgx.ErrNoRows {
		writeError(w, http.StatusNotFound, "Memory not found")
		return
	}
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, m)
}

func (s *Server) handleDeleteMemory(w http.ResponseWriter, r *http.Request) {
	projectID, ok := s.requireOwnedProject(w, r)
	if !ok {
		return
	}
	memoryID := chi.URLParam(r, "memoryID")
	tag, err := s.pool.Exec(r.Context(),
		`DELETE FROM memories WHERE id = $1 AND project_id = $2`, memoryID, projectID)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "Memory not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// projectMemoryStore backs the coding agent's remember/recall tools with the memories table,
// scoped to one project + user. It satisfies agent.MemoryStore so the loop stays ignorant of
// the DB (same narrow-interface design as Model/Workspace). Agent-written entries are tagged
// source='agent' so the UI can distinguish them from user notes.
type projectMemoryStore struct {
	s         *Server
	projectID string
	userID    string
}

// Remember persists a memory the agent chose to keep and returns a short confirmation.
func (m *projectMemoryStore) Remember(ctx context.Context, content, kind string) (string, error) {
	content = strings.TrimSpace(content)
	if content == "" {
		return "error: remember requires non-empty content", nil
	}
	if _, err := m.s.pool.Exec(ctx,
		`INSERT INTO memories (project_id, user_id, kind, content, source)
		 VALUES ($1, $2, $3, $4, 'agent')`,
		m.projectID, m.userID, normalizeMemoryKind(kind), content); err != nil {
		return "", err
	}
	return "remembered", nil
}

// Recall returns the memories matching query (or the most recent ones when query is empty)
// as a compact text block for the agent transcript.
func (m *projectMemoryStore) Recall(ctx context.Context, query string) (string, error) {
	query = strings.TrimSpace(query)
	var rows pgx.Rows
	var err error
	if query != "" {
		rows, err = m.s.pool.Query(ctx,
			`SELECT kind, content FROM memories
			  WHERE project_id = $1 AND content ILIKE '%' || $2 || '%'
			  ORDER BY created_at DESC LIMIT 20`, m.projectID, query)
	} else {
		rows, err = m.s.pool.Query(ctx,
			`SELECT kind, content FROM memories
			  WHERE project_id = $1
			  ORDER BY created_at DESC LIMIT 20`, m.projectID)
	}
	if err != nil {
		return "", err
	}
	defer rows.Close()

	var b strings.Builder
	n := 0
	for rows.Next() {
		var kind, content string
		if err := rows.Scan(&kind, &content); err != nil {
			return "", err
		}
		// Memories can be authored via the UI too — strip invisible Unicode before they
		// re-enter a prompt (Rules-File-Backdoor class defense; log on hit).
		clean, removed := textsafe.Sanitize(content)
		if removed > 0 {
			m.s.logger.Warn("memory contained hidden unicode; stripped before recall",
				"project", m.projectID, "removed_runes", removed)
		}
		fmt.Fprintf(&b, "- [%s] %s\n", kind, clean)
		n++
	}
	if err := rows.Err(); err != nil {
		return "", err
	}
	if n == 0 {
		return "(no memories yet)", nil
	}
	return b.String(), nil
}
