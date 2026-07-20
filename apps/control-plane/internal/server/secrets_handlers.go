package server

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/magnetoid/torsor/control-plane/internal/secrets"
)

// secretMeta is the safe, value-free view of a secret returned to clients.
type secretMeta struct {
	KeyName   string    `json:"keyName"`
	CreatedAt time.Time `json:"createdAt"`
}

// secretCipher builds the AES-GCM cipher from the configured passphrase. Returns
// secrets.ErrDisabled when TORSOR_SECRET_KEY is unset so callers can respond 503.
func (s *Server) secretCipher() (*secrets.Cipher, error) {
	return secrets.NewCipher(s.cfg.SecretKey)
}

// handleListSecrets returns the caller's secret names (never the values). The `enabled`
// flag tells the UI whether the server can store new secrets at all.
func (s *Server) handleListSecrets(w http.ResponseWriter, r *http.Request) {
	rows, err := s.pool.Query(r.Context(),
		`SELECT key_name, created_at FROM secrets WHERE user_id = $1 ORDER BY key_name`, userID(r))
	if err != nil {
		s.fail(w, r, err)
		return
	}
	defer rows.Close()
	items := []secretMeta{}
	for rows.Next() {
		var m secretMeta
		if err := rows.Scan(&m.KeyName, &m.CreatedAt); err != nil {
			s.fail(w, r, err)
			return
		}
		items = append(items, m)
	}
	if err := rows.Err(); err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items, "enabled": s.cfg.SecretKey != ""})
}

// handleCreateSecret creates or replaces one of the caller's secrets. The value is
// encrypted at rest and never returned or logged.
func (s *Server) handleCreateSecret(w http.ResponseWriter, r *http.Request) {
	var body struct {
		KeyName string `json:"keyName"`
		Value   string `json:"value"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	body.KeyName = strings.TrimSpace(body.KeyName)
	if body.KeyName == "" || body.Value == "" {
		writeError(w, http.StatusBadRequest, "keyName and value are required")
		return
	}
	if len(body.KeyName) > 255 {
		writeError(w, http.StatusBadRequest, "keyName must be 255 characters or fewer")
		return
	}
	cipher, err := s.secretCipher()
	if errors.Is(err, secrets.ErrDisabled) {
		writeError(w, http.StatusServiceUnavailable, "Secrets are not configured on this server (set TORSOR_SECRET_KEY)")
		return
	}
	if err != nil {
		s.fail(w, r, err)
		return
	}
	enc, err := cipher.Encrypt(body.Value)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if _, err := s.pool.Exec(r.Context(),
		`INSERT INTO secrets (user_id, key_name, encrypted_value) VALUES ($1, $2, $3)
		 ON CONFLICT (user_id, key_name) DO UPDATE SET encrypted_value = EXCLUDED.encrypted_value`,
		userID(r), body.KeyName, enc); err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "keyName": body.KeyName})
}

// handleDeleteSecret removes one of the caller's secrets, 404 on miss (ownership-scoped).
func (s *Server) handleDeleteSecret(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	tag, err := s.pool.Exec(r.Context(),
		`DELETE FROM secrets WHERE user_id = $1 AND key_name = $2`, userID(r), name)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "Secret not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// lookupUserSecret decrypts one of a user's secrets by name for internal use (e.g. feeding
// a BYO API key into a model provider). Returns ("", nil) when the secret does not exist or
// secrets are disabled, so callers can fall back to host-env credentials.
// providerAPIKey returns the caller's decrypted BYO key for a model provider, looked up by
// the convention secret name "{PROVIDER}_API_KEY" (e.g. anthropic -> ANTHROPIC_API_KEY).
// Returns "" when absent or secrets are disabled, so the plugin falls back to its host key.
func (s *Server) providerAPIKey(ctx context.Context, uid, providerName string) string {
	key, _ := s.lookupUserSecret(ctx, uid, strings.ToUpper(providerName)+"_API_KEY")
	return key
}

func (s *Server) lookupUserSecret(ctx context.Context, uid, keyName string) (string, error) {
	cipher, err := s.secretCipher()
	if errors.Is(err, secrets.ErrDisabled) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	var enc string
	if err := s.pool.QueryRow(ctx,
		`SELECT encrypted_value FROM secrets WHERE user_id = $1 AND key_name = $2`, uid, keyName).
		Scan(&enc); err != nil {
		return "", nil // not found (or read miss) => fall back to host env
	}
	return cipher.Decrypt(enc)
}

// userSecretVault adapts one user's encrypted secrets to agent.SecretVault: the agent uses
// {{secret:NAME}} placeholders, the loop expands them at exec time and scrubs the values
// from observations — secret values never enter a model prompt.
type userSecretVault struct {
	s   *Server
	uid string
}

func (v *userSecretVault) Value(ctx context.Context, name string) (string, bool) {
	val, err := v.s.lookupUserSecret(ctx, v.uid, name)
	if err != nil || val == "" {
		return "", false
	}
	return val, true
}

func (v *userSecretVault) All(ctx context.Context) map[string]string {
	cipher, err := v.s.secretCipher()
	if err != nil { // disabled or misconfigured → nothing to expand/scrub
		return nil
	}
	rows, err := v.s.pool.Query(ctx,
		`SELECT key_name, encrypted_value FROM secrets WHERE user_id = $1`, v.uid)
	if err != nil {
		return nil
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var name, enc string
		if err := rows.Scan(&name, &enc); err != nil {
			return out
		}
		if val, err := cipher.Decrypt(enc); err == nil && val != "" {
			out[name] = val
		}
	}
	return out
}
