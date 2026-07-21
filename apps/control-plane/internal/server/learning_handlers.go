package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/magnetoid/torsor/control-plane/internal/agent"
)

// Learning proposals — the reflection pass stages candidate memories/skills here after a
// substantive agent run; the user approves/dismisses them in the Learning tab. Accepting a
// proposal creates the real memory/skill (via the same inserts the manual paths use) and marks
// the proposal accepted. Every route is scoped to an owned project.

type memoryPayload struct {
	Content string `json:"content"`
	Kind    string `json:"kind"`
}

type skillPayload struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Instruction string `json:"instruction"`
}

type learningProposal struct {
	ID        string          `json:"id"`
	ProjectID string          `json:"projectId"`
	Kind      string          `json:"kind"`   // 'memory' | 'skill'
	Status    string          `json:"status"` // pending | accepted | dismissed
	Payload   json.RawMessage `json:"payload"`
	CreatedAt string          `json:"createdAt"`
}

func (s *Server) handleListProposals(w http.ResponseWriter, r *http.Request) {
	projectID, ok := s.requireOwnedProject(w, r)
	if !ok {
		return
	}
	status := strings.TrimSpace(r.URL.Query().Get("status"))
	if status == "" {
		status = "pending"
	}
	rows, err := s.pool.Query(r.Context(),
		`SELECT id, project_id, kind, status, payload, created_at
		   FROM learning_proposals
		  WHERE project_id = $1 AND status = $2
		  ORDER BY created_at DESC LIMIT 100`, projectID, status)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	defer rows.Close()

	items := []learningProposal{}
	for rows.Next() {
		var p learningProposal
		var payload []byte
		if err := rows.Scan(&p.ID, &p.ProjectID, &p.Kind, &p.Status, &payload, &p.CreatedAt); err != nil {
			s.fail(w, r, err)
			return
		}
		if len(payload) == 0 {
			payload = []byte("{}")
		}
		p.Payload = payload
		items = append(items, p)
	}
	if err := rows.Err(); err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (s *Server) handleAcceptProposal(w http.ResponseWriter, r *http.Request) {
	projectID, ok := s.requireOwnedProject(w, r)
	if !ok {
		return
	}
	proposalID := chi.URLParam(r, "proposalID")

	var kind string
	var payload []byte
	err := s.pool.QueryRow(r.Context(),
		`SELECT kind, payload FROM learning_proposals
		  WHERE id = $1 AND project_id = $2 AND status = 'pending'`, proposalID, projectID).
		Scan(&kind, &payload)
	if err == pgx.ErrNoRows {
		writeError(w, http.StatusNotFound, "Proposal not found")
		return
	}
	if err != nil {
		s.fail(w, r, err)
		return
	}

	switch kind {
	case "memory":
		var mp memoryPayload
		_ = json.Unmarshal(payload, &mp)
		if strings.TrimSpace(mp.Content) == "" {
			writeError(w, http.StatusUnprocessableEntity, "Proposal has no memory content")
			return
		}
		if _, err := s.pool.Exec(r.Context(),
			`INSERT INTO memories (project_id, user_id, kind, content, source)
			 VALUES ($1, $2, $3, $4, 'agent')`,
			projectID, userID(r), normalizeMemoryKind(mp.Kind), strings.TrimSpace(mp.Content)); err != nil {
			s.fail(w, r, err)
			return
		}
	case "skill":
		var sp skillPayload
		_ = json.Unmarshal(payload, &sp)
		if strings.TrimSpace(sp.Name) == "" || strings.TrimSpace(sp.Instruction) == "" {
			writeError(w, http.StatusUnprocessableEntity, "Proposal is missing a skill name or instruction")
			return
		}
		// Accepting a skill enables it (accepting IS the approval).
		if _, err := s.pool.Exec(r.Context(),
			`INSERT INTO skills (project_id, user_id, name, description, instruction, enabled)
			 VALUES ($1, $2, $3, $4, $5, TRUE)`,
			projectID, userID(r), strings.TrimSpace(sp.Name), strings.TrimSpace(sp.Description), strings.TrimSpace(sp.Instruction)); err != nil {
			s.fail(w, r, err)
			return
		}
	default:
		writeError(w, http.StatusUnprocessableEntity, "Unknown proposal kind")
		return
	}

	if _, err := s.pool.Exec(r.Context(),
		`UPDATE learning_proposals SET status='accepted', updated_at=NOW() WHERE id=$1 AND project_id=$2`,
		proposalID, projectID); err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleDismissProposal(w http.ResponseWriter, r *http.Request) {
	projectID, ok := s.requireOwnedProject(w, r)
	if !ok {
		return
	}
	proposalID := chi.URLParam(r, "proposalID")
	tag, err := s.pool.Exec(r.Context(),
		`UPDATE learning_proposals SET status='dismissed', updated_at=NOW()
		  WHERE id=$1 AND project_id=$2 AND status='pending'`, proposalID, projectID)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "Proposal not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// --- helpers used by the reflection hook (Slice 3) ---

// insertMemoryProposal / insertSkillProposal stage a pending proposal, deduped against existing
// entries and pending proposals. Best-effort: returns true if a new proposal was inserted.
func (s *Server) insertMemoryProposal(ctx context.Context, projectID, uid, content, kind string) bool {
	content = strings.TrimSpace(content)
	if content == "" {
		return false
	}
	// Dedup: skip if an equal memory already exists or an equal pending proposal is staged.
	var exists bool
	_ = s.pool.QueryRow(ctx,
		`SELECT EXISTS(
		   SELECT 1 FROM memories WHERE project_id=$1 AND lower(content)=lower($2)
		   UNION ALL
		   SELECT 1 FROM learning_proposals
		     WHERE project_id=$1 AND kind='memory' AND status='pending'
		       AND lower(payload->>'content')=lower($2))`, projectID, content).Scan(&exists)
	if exists {
		return false
	}
	payload, _ := json.Marshal(memoryPayload{Content: content, Kind: normalizeMemoryKind(kind)})
	_, err := s.pool.Exec(ctx,
		`INSERT INTO learning_proposals (project_id, user_id, kind, payload) VALUES ($1,$2,'memory',$3)`,
		projectID, uid, payload)
	return err == nil
}

func (s *Server) insertSkillProposal(ctx context.Context, projectID, uid, name, description, instruction string) bool {
	name = strings.TrimSpace(name)
	instruction = strings.TrimSpace(instruction)
	if name == "" || instruction == "" {
		return false
	}
	var exists bool
	_ = s.pool.QueryRow(ctx,
		`SELECT EXISTS(
		   SELECT 1 FROM skills WHERE project_id=$1 AND lower(name)=lower($2)
		   UNION ALL
		   SELECT 1 FROM learning_proposals
		     WHERE project_id=$1 AND kind='skill' AND status='pending'
		       AND lower(payload->>'name')=lower($2))`, projectID, name).Scan(&exists)
	if exists {
		return false
	}
	payload, _ := json.Marshal(skillPayload{Name: name, Description: strings.TrimSpace(description), Instruction: instruction})
	_, err := s.pool.Exec(ctx,
		`INSERT INTO learning_proposals (project_id, user_id, kind, payload) VALUES ($1,$2,'skill',$3)`,
		projectID, uid, payload)
	return err == nil
}

// reflectAsync runs the reflection pass in the background after a substantive agent run and
// stages any durable learnings as pending proposals. Fully best-effort: a detached, bounded
// context so it never touches the request, and every failure is swallowed with a log — the
// user's run is already finished and must be unaffected. Notifies once if anything was staged.
func (s *Server) reflectAsync(projectID, uid string, model agent.Model, apiKey, task, actionLog, final string) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
		defer cancel()
		// Routing role "reflect": when TORSOR_MODEL_ROUTING names a provider for
		// reflection, use it (with the user's key for THAT provider) instead of the
		// run's provider — reflection is summarization, a cheap-model job.
		if routed := routedProviderName("reflect"); routed != "" {
			if p, name, ok := s.pickModelProvider(routed); ok {
				model, apiKey = p, s.providerAPIKey(ctx, uid, name)
			}
		}
		p, err := agent.Reflect(ctx, model, agent.ReflectInput{
			Task: task, ActionLog: actionLog, Final: final, APIKey: apiKey,
		})
		if err != nil {
			s.logger.Warn("reflection failed", "err", err, "project", projectID)
			return
		}
		n := 0
		for _, m := range p.Memories {
			if s.insertMemoryProposal(ctx, projectID, uid, m.Content, m.Kind) {
				n++
			}
		}
		for _, sk := range p.Skills {
			if s.insertSkillProposal(ctx, projectID, uid, sk.Name, sk.Description, sk.Instruction) {
				n++
			}
		}
		if n > 0 {
			s.emitNotification(ctx, uid, "learning", "Learned something new",
				fmt.Sprintf("The agent proposed %d thing(s) to remember. Review them in the Learning tab.", n),
				"", map[string]any{"projectId": projectID})
		}
	}()
}
