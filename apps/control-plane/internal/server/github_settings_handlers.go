package server

import (
	"context"
	"errors"
	"net/http"

	"github.com/magnetoid/torsor/control-plane/internal/secrets"
)

// githubSettingsRow mirrors the github_app_settings columns (secrets stored encrypted).
type githubSettingsRow struct {
	AppID            string
	AppSlug          string
	ClientID         string
	ClientSecretEnc  string
	PrivateKeyEnc    string
	WebhookSecretEnc string
	Enabled          bool
	AllowSignup      bool
}

// githubSettingsPatch is the PATCH body; nil pointer = field not provided.
type githubSettingsPatch struct {
	AppID         *string `json:"appId"`
	AppSlug       *string `json:"appSlug"`
	ClientID      *string `json:"clientId"`
	ClientSecret  *string `json:"clientSecret"`
	PrivateKey    *string `json:"privateKey"`
	WebhookSecret *string `json:"webhookSecret"`
	Enabled       *bool   `json:"enabled"`
	AllowSignup   *bool   `json:"allowSignup"`
}

// githubSettingsResponse is the masked GET/PATCH response — never exposes secret values.
type githubSettingsResponse struct {
	AppID            string `json:"appId"`
	AppSlug          string `json:"appSlug"`
	ClientID         string `json:"clientId"`
	ClientSecretSet  bool   `json:"clientSecretSet"`
	PrivateKeySet    bool   `json:"privateKeySet"`
	WebhookSecretSet bool   `json:"webhookSecretSet"`
	Enabled          bool   `json:"enabled"`
	AllowSignup      bool   `json:"allowSignup"`
	CallbackURL      string `json:"callbackUrl"`
}

// githubConfig is the decrypted subset the login flow needs.
type githubConfig struct {
	ClientID     string
	ClientSecret string
	Enabled      bool
	AllowSignup  bool
}

// applyGitHubPatch merges a patch onto the current row. Non-secret fields are set when the
// pointer is non-nil; secret fields are (re)encrypted only when a non-empty value is supplied,
// so saving other fields — or sending "" — never wipes an existing secret. Pure (encrypt injected).
func applyGitHubPatch(cur githubSettingsRow, p githubSettingsPatch, encrypt func(string) (string, error)) (githubSettingsRow, error) {
	if p.AppID != nil {
		cur.AppID = *p.AppID
	}
	if p.AppSlug != nil {
		cur.AppSlug = *p.AppSlug
	}
	if p.ClientID != nil {
		cur.ClientID = *p.ClientID
	}
	if p.Enabled != nil {
		cur.Enabled = *p.Enabled
	}
	if p.AllowSignup != nil {
		cur.AllowSignup = *p.AllowSignup
	}
	for _, sec := range []struct {
		val *string
		dst *string
	}{
		{p.ClientSecret, &cur.ClientSecretEnc},
		{p.PrivateKey, &cur.PrivateKeyEnc},
		{p.WebhookSecret, &cur.WebhookSecretEnc},
	} {
		if sec.val != nil && *sec.val != "" {
			enc, err := encrypt(*sec.val)
			if err != nil {
				return cur, err
			}
			*sec.dst = enc
		}
	}
	return cur, nil
}

func (r githubSettingsRow) toResponse(callbackURL string) githubSettingsResponse {
	return githubSettingsResponse{
		AppID:            r.AppID,
		AppSlug:          r.AppSlug,
		ClientID:         r.ClientID,
		ClientSecretSet:  r.ClientSecretEnc != "",
		PrivateKeySet:    r.PrivateKeyEnc != "",
		WebhookSecretSet: r.WebhookSecretEnc != "",
		Enabled:          r.Enabled,
		AllowSignup:      r.AllowSignup,
		CallbackURL:      callbackURL,
	}
}

func (s *Server) githubCallbackURL() string {
	return s.cfg.AppURL + "/api/v1/auth/github/callback"
}

func (s *Server) loadGitHubSettingsRow(ctx context.Context) (githubSettingsRow, error) {
	var row githubSettingsRow
	err := s.pool.QueryRow(ctx,
		`SELECT app_id, app_slug, client_id, client_secret_enc, private_key_enc,
		        webhook_secret_enc, enabled, allow_signup
		   FROM github_app_settings WHERE id = TRUE`).
		Scan(&row.AppID, &row.AppSlug, &row.ClientID, &row.ClientSecretEnc,
			&row.PrivateKeyEnc, &row.WebhookSecretEnc, &row.Enabled, &row.AllowSignup)
	return row, err
}

func (s *Server) handleGetGitHubSettings(w http.ResponseWriter, r *http.Request) {
	row, err := s.loadGitHubSettingsRow(r.Context())
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, row.toResponse(s.githubCallbackURL()))
}

func (s *Server) handleUpdateGitHubSettings(w http.ResponseWriter, r *http.Request) {
	var patch githubSettingsPatch
	if err := decodeJSON(r, &patch); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	cipher, err := s.secretCipher()
	if err != nil {
		if errors.Is(err, secrets.ErrDisabled) {
			writeError(w, http.StatusServiceUnavailable, "Secret storage is not configured (set TORSOR_SECRET_KEY)")
			return
		}
		s.fail(w, r, err)
		return
	}
	cur, err := s.loadGitHubSettingsRow(r.Context())
	if err != nil {
		s.fail(w, r, err)
		return
	}
	next, err := applyGitHubPatch(cur, patch, cipher.Encrypt)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if _, err := s.pool.Exec(r.Context(),
		`UPDATE github_app_settings
		    SET app_id = $1, app_slug = $2, client_id = $3, client_secret_enc = $4,
		        private_key_enc = $5, webhook_secret_enc = $6, enabled = $7,
		        allow_signup = $8, updated_at = NOW()
		  WHERE id = TRUE`,
		next.AppID, next.AppSlug, next.ClientID, next.ClientSecretEnc,
		next.PrivateKeyEnc, next.WebhookSecretEnc, next.Enabled, next.AllowSignup); err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, next.toResponse(s.githubCallbackURL()))
}

// loadGitHubConfig returns the decrypted client credentials + flags for the login flow.
func (s *Server) loadGitHubConfig(ctx context.Context) (*githubConfig, error) {
	row, err := s.loadGitHubSettingsRow(ctx)
	if err != nil {
		return nil, err
	}
	cfg := &githubConfig{ClientID: row.ClientID, Enabled: row.Enabled, AllowSignup: row.AllowSignup}
	if row.ClientSecretEnc != "" {
		cipher, err := s.secretCipher()
		if err != nil {
			return nil, err
		}
		if cfg.ClientSecret, err = cipher.Decrypt(row.ClientSecretEnc); err != nil {
			return nil, err
		}
	}
	return cfg, nil
}
