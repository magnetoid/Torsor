// Package auth provides password hashing, JWT issuing/parsing, session-backed
// verification, and the HTTP middleware that protects authenticated routes. Behavior
// mirrors the legacy apps/api auth module (bcrypt cost 10, HS256 JWT carrying a
// sessionId, server-side session validation for real logout/revocation).
package auth

import (
	"context"
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

type Role string

const (
	RoleUser       Role = "user"
	RoleAdmin      Role = "admin"
	RoleSuperAdmin Role = "super_admin"
)

// APIUser is the sanitized user record (never includes the password hash).
type APIUser struct {
	ID        string
	Email     string
	Username  string
	AvatarURL *string
	Bio       *string
	Role      Role
	Onboarded bool
	CreatedAt time.Time
	UpdatedAt time.Time
}

// Claims is the JWT payload. Field names match the legacy tokens so existing tokens
// remain valid across the migration.
type Claims struct {
	UserID    string `json:"userId"`
	Email     string `json:"email"`
	SessionID string `json:"sessionId,omitempty"`
	jwt.RegisteredClaims
}

// Manager bundles auth dependencies (DB pool + JWT settings).
type Manager struct {
	pool   *pgxpool.Pool
	secret []byte
	expiry time.Duration
}

func NewManager(pool *pgxpool.Pool, secret string, expiry time.Duration) *Manager {
	return &Manager{pool: pool, secret: []byte(secret), expiry: expiry}
}

func HashPassword(password string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(password), 10)
	return string(b), err
}

func VerifyPassword(password, hash string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

// SignToken issues a signed JWT for a freshly created session.
func (m *Manager) SignToken(userID, email, sessionID string) (string, error) {
	now := time.Now()
	claims := Claims{
		UserID:    userID,
		Email:     email,
		SessionID: sessionID,
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(m.expiry)),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(m.secret)
}

// ParseToken validates the signature and expiry and returns the claims.
func (m *Manager) ParseToken(tokenStr string) (*Claims, error) {
	claims := &Claims{}
	_, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return m.secret, nil
	})
	if err != nil {
		return nil, err
	}
	return claims, nil
}

// ErrSessionInvalid is returned by Authenticate when the backing session is gone.
var ErrSessionInvalid = errors.New("session expired or revoked")

// Authenticate validates a raw token string (signature + live session) and returns its
// claims. Used by transports that cannot run the HTTP Require middleware, e.g. WebSocket
// upgrades that carry the token in a query parameter.
func (m *Manager) Authenticate(ctx context.Context, token string) (*Claims, error) {
	claims, err := m.ParseToken(token)
	if err != nil {
		return nil, err
	}
	// A token without a sessionId is forged/malformed — every issued token has one.
	// Require it so the server-side session check can't be bypassed.
	if claims.SessionID == "" {
		return nil, ErrSessionInvalid
	}
	valid, err := m.SessionValid(ctx, claims.SessionID)
	if err != nil {
		return nil, err
	}
	if !valid {
		return nil, ErrSessionInvalid
	}
	return claims, nil
}

// SessionValid reports whether a session row exists and has not expired.
func (m *Manager) SessionValid(ctx context.Context, sessionID string) (bool, error) {
	var id string
	err := m.pool.QueryRow(ctx,
		`SELECT id FROM sessions WHERE id = $1 AND expires_at > NOW()`, sessionID,
	).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

// SanitizeUserByID loads a user without the password hash.
func (m *Manager) SanitizeUserByID(ctx context.Context, userID string) (*APIUser, error) {
	u := &APIUser{}
	var role *string
	err := m.pool.QueryRow(ctx,
		`SELECT id, email, username, avatar_url, bio, role, onboarded, created_at, updated_at
		   FROM users WHERE id = $1`, userID,
	).Scan(&u.ID, &u.Email, &u.Username, &u.AvatarURL, &u.Bio, &role, &u.Onboarded, &u.CreatedAt, &u.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if role != nil {
		u.Role = Role(*role)
	} else {
		u.Role = RoleUser
	}
	return u, nil
}
