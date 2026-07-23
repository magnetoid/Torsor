package server

import (
	"context"
	"crypto/subtle"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"golang.org/x/oauth2"
	githuboauth "golang.org/x/oauth2/github"
)

const (
	ghStatePurpose   = "gh_state"
	ghHandoffPurpose = "gh_handoff"
	ghStateTTL       = 10 * time.Minute
	ghHandoffTTL     = 60 * time.Second
)

// redirectLogin sends the browser back to the SPA login page with an error code.
func (s *Server) redirectLogin(w http.ResponseWriter, r *http.Request, reason string) {
	http.Redirect(w, r, s.cfg.AppURL+"/login?error="+reason, http.StatusFound)
}

func (s *Server) githubOAuthConfig(cfg *githubConfig) *oauth2.Config {
	return &oauth2.Config{
		ClientID:     cfg.ClientID,
		ClientSecret: cfg.ClientSecret,
		Endpoint:     githuboauth.Endpoint,
		RedirectURL:  s.githubCallbackURL(),
		Scopes:       []string{"user:email"},
	}
}

// githubEnabled reports whether GitHub login is usable (configured + secret storage on).
func (s *Server) githubLoginConfig(r *http.Request) (*githubConfig, bool) {
	if s.cfg.SecretKey == "" {
		return nil, false
	}
	cfg, err := s.loadGitHubConfig(r.Context())
	if err != nil || !cfg.Enabled || cfg.ClientID == "" || cfg.ClientSecret == "" {
		return nil, false
	}
	return cfg, true
}

// GET /api/v1/auth/providers — public probe so the login page knows whether to show the button.
func (s *Server) handleAuthProviders(w http.ResponseWriter, r *http.Request) {
	_, ok := s.githubLoginConfig(r)
	writeJSON(w, http.StatusOK, map[string]any{"github": map[string]bool{"enabled": ok}})
}

// GET /api/v1/auth/github — start the OAuth dance.
func (s *Server) handleGitHubLoginStart(w http.ResponseWriter, r *http.Request) {
	cfg, ok := s.githubLoginConfig(r)
	if !ok {
		s.redirectLogin(w, r, "github_unavailable")
		return
	}
	nonce := randHex(16)
	state := s.signSignedToken(ghStatePurpose, nonce, ghStateTTL)
	http.SetCookie(w, &http.Cookie{
		Name:     "gh_oauth_state",
		Value:    nonce,
		Path:     "/api/v1/auth/github",
		MaxAge:   int(ghStateTTL.Seconds()),
		HttpOnly: true,
		Secure:   strings.HasPrefix(s.cfg.AppURL, "https://"),
		SameSite: http.SameSiteLaxMode,
	})
	http.Redirect(w, r, s.githubOAuthConfig(cfg).AuthCodeURL(state), http.StatusFound)
}

// GET /api/v1/auth/github/callback — exchange code, resolve account, hand off.
func (s *Server) handleGitHubCallback(w http.ResponseWriter, r *http.Request) {
	cfg, ok := s.githubLoginConfig(r)
	if !ok {
		s.redirectLogin(w, r, "github_unavailable")
		return
	}
	nonce, err := s.verifySignedToken(ghStatePurpose, r.URL.Query().Get("state"))
	if err != nil {
		s.redirectLogin(w, r, "state")
		return
	}
	cookie, cerr := r.Cookie("gh_oauth_state")
	if cerr != nil || cookie.Value == "" || subtle.ConstantTimeCompare([]byte(cookie.Value), []byte(nonce)) != 1 {
		s.redirectLogin(w, r, "state")
		return
	}
	// One-time use: clear the state cookie.
	http.SetCookie(w, &http.Cookie{
		Name: "gh_oauth_state", Value: "", Path: "/api/v1/auth/github",
		MaxAge: -1, HttpOnly: true,
		Secure: strings.HasPrefix(s.cfg.AppURL, "https://"), SameSite: http.SameSiteLaxMode,
	})
	code := r.URL.Query().Get("code")
	if code == "" {
		s.redirectLogin(w, r, "exchange_failed")
		return
	}
	oc := s.githubOAuthConfig(cfg)
	tok, err := oc.Exchange(r.Context(), code)
	if err != nil {
		s.redirectLogin(w, r, "exchange_failed")
		return
	}
	hc := oc.Client(r.Context(), tok)

	ghUser, err := fetchGitHubUser(r.Context(), hc)
	if err != nil {
		s.redirectLogin(w, r, "exchange_failed")
		return
	}
	email, err := fetchGitHubPrimaryVerifiedEmail(r.Context(), hc)
	if err != nil {
		if err == errNoVerifiedEmail {
			s.redirectLogin(w, r, "email_unverified")
		} else {
			s.redirectLogin(w, r, "server_error")
		}
		return
	}

	userID, err := s.resolveGitHubUser(r, ghUser, email, cfg.AllowSignup)
	if err == errSignupDisabled {
		s.redirectLogin(w, r, "signups_disabled")
		return
	} else if err != nil {
		s.redirectLogin(w, r, "server_error")
		return
	}

	handoff := s.signSignedToken(ghHandoffPurpose, userID, ghHandoffTTL)
	http.Redirect(w, r, s.cfg.AppURL+"/auth/callback?code="+handoff, http.StatusFound)
}

// POST /api/v1/auth/github/exchange — swap the handoff code for a real session + JWT.
func (s *Server) handleGitHubExchange(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Code string `json:"code"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	userID, err := s.verifySignedToken(ghHandoffPurpose, body.Code)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "Invalid or expired code")
		return
	}
	resp, err := s.issueAuthResponse(r.Context(), userID)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

var errSignupDisabled = errors.New("github signups disabled")

// resolveGitHubUser runs the two lookups, applies decideGitHubAccount, and performs the
// resulting DB writes, returning the resolved Torsor user id.
func (s *Server) resolveGitHubUser(r *http.Request, gh *githubUser, email string, allowSignup bool) (string, error) {
	ctx := r.Context()
	providerUserID := strconv.FormatInt(gh.ID, 10)

	var identityUser string
	if err := s.pool.QueryRow(ctx,
		`SELECT user_id FROM user_identities WHERE provider = 'github' AND provider_user_id = $1`,
		providerUserID).Scan(&identityUser); err != nil && err != pgx.ErrNoRows {
		return "", err
	}

	var emailUser string
	if identityUser == "" {
		if err := s.pool.QueryRow(ctx,
			`SELECT id FROM users WHERE email = LOWER($1) LIMIT 1`, email).Scan(&emailUser); err != nil && err != pgx.ErrNoRows {
			return "", err
		}
	}

	action, target := decideGitHubAccount(identityUser, emailUser, allowSignup)
	switch action {
	case ghUseUser:
		return target, nil
	case ghLinkExisting:
		if err := s.linkGitHubIdentity(ctx, target, gh, email); err != nil {
			return "", err
		}
		return target, nil
	case ghSignup:
		id, err := s.createGitHubUser(ctx, gh, email)
		if err != nil {
			return "", err
		}
		if err := s.linkGitHubIdentity(ctx, id, gh, email); err != nil {
			return "", err
		}
		return id, nil
	default:
		return "", errSignupDisabled
	}
}

func (s *Server) linkGitHubIdentity(ctx context.Context, userID string, gh *githubUser, email string) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO user_identities (user_id, provider, provider_user_id, provider_login, provider_email)
		 VALUES ($1, 'github', $2, $3, $4)
		 ON CONFLICT (provider, provider_user_id) DO NOTHING`,
		userID, strconv.FormatInt(gh.ID, 10), gh.Login, email)
	return err
}

// createGitHubUser inserts a passwordless user + personal team, mirroring handleSignup.
func (s *Server) createGitHubUser(ctx context.Context, gh *githubUser, email string) (string, error) {
	username := slugify(gh.Login, email) + "-" + randHex(3)
	role := "user"
	for _, e := range s.cfg.SuperAdminEmails {
		if e == strings.ToLower(email) {
			role = "super_admin"
			break
		}
	}
	var avatar *string
	if gh.AvatarURL != "" {
		avatar = &gh.AvatarURL
	}
	var id string
	if err := s.pool.QueryRow(ctx,
		`INSERT INTO users (email, username, avatar_url, role) VALUES (LOWER($1), $2, $3, $4) RETURNING id`,
		email, username, avatar, role).Scan(&id); err != nil {
		return "", err
	}
	if _, err := s.pool.Exec(ctx,
		`INSERT INTO teams (name, slug, owner_id) VALUES ($1, $2, $3)`,
		"Personal Workspace", "personal-"+id[:8], id); err != nil {
		return "", err
	}
	return id, nil
}
