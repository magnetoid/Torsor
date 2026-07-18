package server

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/magnetoid/torsor/control-plane/internal/plugin"
)

// handleWorkspacePTY runs an interactive terminal over a WebSocket, backed by the workspace
// runtime's ExecInteractive (a real PTY in docker-runtime). Wire protocol, all JSON:
//
//	client -> server: first frame {command?, workingDir?, rows?, cols?} (the start), then
//	                  {stdin:"..."} for keystrokes and {resize:{rows,cols}} on terminal resize
//	server -> client: {stdout, stderr, exitCode, done} frames; the final frame has done=true
//
// Like the other WebSocket routes it sits outside the Bearer-auth middleware (browsers can't
// set an Authorization header on a WebSocket), so it authenticates the `access_token` query
// param itself and scopes to project ownership — the runtime workspace id is the project id,
// never a client-supplied value, so a user can only drive their own workspace.
func (s *Server) handleWorkspacePTY(w http.ResponseWriter, r *http.Request) {
	token := bearerOrQueryToken(r)
	if token == "" {
		writeError(w, http.StatusUnauthorized, "Authentication required")
		return
	}
	claims, err := s.auth.Authenticate(r.Context(), token)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "Invalid or expired token")
		return
	}

	projectID := chi.URLParam(r, "projectID")
	var owned string
	if err := s.pool.QueryRow(r.Context(),
		`SELECT id FROM projects WHERE id = $1 AND user_id = $2`, projectID, claims.UserID).Scan(&owned); err != nil {
		writeError(w, http.StatusNotFound, "Project not found")
		return
	}

	ws, err := scanWorkspace(s.pool.QueryRow(r.Context(),
		`SELECT `+workspaceCols+` FROM workspaces WHERE project_id = $1`, projectID))
	if err == pgx.ErrNoRows {
		writeError(w, http.StatusNotFound, "Workspace not found for this project")
		return
	}
	if err != nil {
		s.fail(w, r, err)
		return
	}
	rt, _, ok := s.pickRuntime(ws.Runtime)
	if !ok {
		writeError(w, http.StatusServiceUnavailable, "Workspace runtime '"+ws.Runtime+"' is not available")
		return
	}

	upgrader := s.wsUpgrader()
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return // Upgrade already wrote an error response
	}
	defer conn.Close()

	// The first frame starts the session: the command (empty => default shell) and size.
	var start struct {
		Command    []string `json:"command"`
		WorkingDir string   `json:"workingDir"`
		Rows       uint16   `json:"rows"`
		Cols       uint16   `json:"cols"`
	}
	if err := conn.ReadJSON(&start); err != nil {
		_ = conn.WriteJSON(map[string]string{"error": "first frame must be a JSON start"})
		return
	}

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	// Reader goroutine: forward stdin/resize frames into the input channel, and close it (and
	// cancel the exec) when the client disconnects. Only this goroutine reads the conn; only
	// the ExecInteractive callback below writes it — gorilla allows one concurrent reader and
	// one concurrent writer, so no write mutex is needed.
	in := make(chan plugin.ExecInput, 32)
	go func() {
		defer close(in)
		for {
			_, data, err := conn.ReadMessage()
			if err != nil {
				cancel()
				return
			}
			var frame struct {
				Stdin  string `json:"stdin"`
				Resize *struct {
					Rows uint16 `json:"rows"`
					Cols uint16 `json:"cols"`
				} `json:"resize"`
			}
			if json.Unmarshal(data, &frame) != nil {
				continue
			}
			switch {
			case frame.Resize != nil:
				in <- plugin.ExecInput{Resize: &plugin.WinSize{Rows: frame.Resize.Rows, Cols: frame.Resize.Cols}}
			case frame.Stdin != "":
				in <- plugin.ExecInput{Stdin: []byte(frame.Stdin)}
			}
		}
	}()

	execErr := rt.ExecInteractive(ctx, plugin.ExecSpec{
		WorkspaceID: projectID,
		Command:     start.Command,
		WorkingDir:  start.WorkingDir,
		Rows:        start.Rows,
		Cols:        start.Cols,
	}, in, func(c plugin.ExecChunk) error {
		return conn.WriteJSON(map[string]any{
			"stdout":   c.Stdout,
			"stderr":   c.Stderr,
			"exitCode": c.ExitCode,
			"done":     c.Done,
		})
	})
	if execErr != nil {
		if st, ok := status.FromError(execErr); ok && st.Code() == codes.Unimplemented {
			_ = conn.WriteJSON(map[string]any{"error": "This workspace runtime does not support an interactive terminal", "done": true})
			return
		}
		_ = conn.WriteJSON(map[string]any{"error": execErr.Error(), "done": true})
	}
}
