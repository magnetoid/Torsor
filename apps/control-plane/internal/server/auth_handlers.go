package server

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/magnetoid/torsor/control-plane/internal/auth"
)

var slugRe = regexp.MustCompile(`[^a-z0-9]+`)

type userPayload struct {
	ID        string    `json:"id"`
	Email     string    `json:"email"`
	Username  string    `json:"username"`
	Name      string    `json:"name"`
	AvatarURL *string   `json:"avatarUrl"`
	Role      auth.Role `json:"role"`
	Onboarded bool      `json:"onboarded"`
	CreatedAt time.Time `json:"createdAt"`
}

type authResponse struct {
	Token string      `json:"token"`
	User  userPayload `json:"user"`
}

// resolveRole keeps DB admin/super_admin roles, promotes configured super-admin emails,
// and otherwise falls back to the stored role (default user).
func (s *Server) resolveRole(email string, dbRole auth.Role) auth.Role {
	if dbRole == auth.RoleSuperAdmin || dbRole == auth.RoleAdmin {
		return dbRole
	}
	for _, e := range s.cfg.SuperAdminEmails {
		if e == strings.ToLower(email) {
			return auth.RoleSuperAdmin
		}
	}
	if dbRole == "" {
		return auth.RoleUser
	}
	return dbRole
}

func (s *Server) toUserPayload(u *auth.APIUser) userPayload {
	return userPayload{
		ID:        u.ID,
		Email:     u.Email,
		Username:  u.Username,
		Name:      u.Username,
		AvatarURL: u.AvatarURL,
		Role:      s.resolveRole(u.Email, u.Role),
		Onboarded: true,
		CreatedAt: u.CreatedAt,
	}
}

// issueAuthResponse creates a session row and signs a JWT for the given user.
func (s *Server) issueAuthResponse(ctx context.Context, userID string) (*authResponse, error) {
	u, err := s.auth.SanitizeUserByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	if u == nil {
		return nil, pgx.ErrNoRows
	}

	sessionID := uuid.NewString()
	rawToken := randHex(32)
	tokenHash := sha256.Sum256([]byte(rawToken))
	expiresAt := time.Now().Add(s.cfg.JWTExpiry)

	if _, err := s.pool.Exec(ctx,
		`INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)`,
		sessionID, u.ID, hex.EncodeToString(tokenHash[:]), expiresAt,
	); err != nil {
		return nil, err
	}

	token, err := s.auth.SignToken(u.ID, u.Email, sessionID)
	if err != nil {
		return nil, err
	}
	return &authResponse{Token: token, User: s.toUserPayload(u)}, nil
}

func (s *Server) handleSignup(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name     string `json:"name"`
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if body.Name == "" || body.Email == "" || len(body.Password) < 8 {
		writeError(w, http.StatusBadRequest, "name, email, and password (min 8 chars) are required")
		return
	}

	email := strings.ToLower(body.Email)
	var existing string
	err := s.pool.QueryRow(r.Context(), `SELECT id FROM users WHERE email = $1 LIMIT 1`, email).Scan(&existing)
	if err == nil {
		writeError(w, http.StatusConflict, "An account with that email already exists")
		return
	} else if err != pgx.ErrNoRows {
		s.fail(w, r, err)
		return
	}

	hash, err := auth.HashPassword(body.Password)
	if err != nil {
		s.fail(w, r, err)
		return
	}

	username := slugify(body.Name, email) + "-" + randHex(3)
	role := auth.RoleUser
	for _, e := range s.cfg.SuperAdminEmails {
		if e == email {
			role = auth.RoleSuperAdmin
			break
		}
	}

	var id string
	if err := s.pool.QueryRow(r.Context(),
		`INSERT INTO users (email, username, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id`,
		email, username, hash, string(role),
	).Scan(&id); err != nil {
		s.fail(w, r, err)
		return
	}

	resp, err := s.issueAuthResponse(r.Context(), id)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, resp)
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if body.Email == "" || body.Password == "" {
		writeError(w, http.StatusBadRequest, "email and password are required")
		return
	}

	var id, hash string
	err := s.pool.QueryRow(r.Context(),
		`SELECT id, password_hash FROM users WHERE email = $1 LIMIT 1`, strings.ToLower(body.Email),
	).Scan(&id, &hash)
	if err == pgx.ErrNoRows || (err == nil && !auth.VerifyPassword(body.Password, hash)) {
		writeError(w, http.StatusUnauthorized, "Invalid email or password")
		return
	}
	if err != nil {
		s.fail(w, r, err)
		return
	}

	resp, err := s.issueAuthResponse(r.Context(), id)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	if claims, ok := auth.FromContext(r.Context()); ok && claims.SessionID != "" {
		if _, err := s.pool.Exec(r.Context(), `DELETE FROM sessions WHERE id = $1`, claims.SessionID); err != nil {
			s.fail(w, r, err)
			return
		}
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	claims, _ := auth.FromContext(r.Context())
	u, err := s.auth.SanitizeUserByID(r.Context(), claims.UserID)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if u == nil {
		writeError(w, http.StatusNotFound, "User not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": s.toUserPayload(u)})
}

// fail logs the error and returns a generic 500 (detail only outside production).
func (s *Server) fail(w http.ResponseWriter, r *http.Request, err error) {
	s.logger.Error("request error", "path", r.URL.Path, "err", err)
	if s.cfg.IsProduction() {
		writeError(w, http.StatusInternalServerError, "Internal Server Error")
		return
	}
	writeJSON(w, http.StatusInternalServerError, map[string]string{
		"error":   "Internal Server Error",
		"message": err.Error(),
	})
}

func slugify(name, fallbackEmail string) string {
	s := slugRe.ReplaceAllString(strings.ToLower(strings.TrimSpace(name)), "-")
	s = strings.Trim(s, "-")
	if s == "" {
		s = strings.Split(fallbackEmail, "@")[0]
	}
	return s
}

func randHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
