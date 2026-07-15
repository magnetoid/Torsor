package auth

import (
	"context"
	"net/http"
	"strings"
)

type ctxKey int

const authCtxKey ctxKey = iota

// FromContext returns the authenticated claims attached by Require, if any.
func FromContext(ctx context.Context) (*Claims, bool) {
	c, ok := ctx.Value(authCtxKey).(*Claims)
	return c, ok
}

// WithClaims attaches claims to a context so FromContext (and userID/ownsProject) work for
// handlers that authenticate outside the Require middleware — e.g. query-token routes like
// the live-preview proxy that browsers load in an iframe without an Authorization header.
func WithClaims(ctx context.Context, c *Claims) context.Context {
	return context.WithValue(ctx, authCtxKey, c)
}

// Require is middleware that enforces a valid Bearer token AND a live session row.
// On failure it writes a JSON 401 and does not call the next handler.
func (m *Manager) Require(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := bearer(r)
		if token == "" {
			writeAuthError(w, http.StatusUnauthorized, "Authentication required")
			return
		}
		claims, err := m.ParseToken(token)
		if err != nil {
			writeAuthError(w, http.StatusUnauthorized, "Invalid or expired token")
			return
		}
		// Enforce the server-side session so logout actually revokes access.
		if claims.SessionID != "" {
			valid, err := m.SessionValid(r.Context(), claims.SessionID)
			if err != nil {
				writeAuthError(w, http.StatusInternalServerError, "Authentication check failed")
				return
			}
			if !valid {
				writeAuthError(w, http.StatusUnauthorized, "Session expired or revoked")
				return
			}
		}
		ctx := context.WithValue(r.Context(), authCtxKey, claims)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func bearer(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if !strings.HasPrefix(h, "Bearer ") {
		return ""
	}
	return strings.TrimSpace(strings.TrimPrefix(h, "Bearer "))
}

func writeAuthError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write([]byte(`{"error":` + jsonString(msg) + `}`))
}

// jsonString does a minimal safe quote for the short, known error strings above.
func jsonString(s string) string {
	var b strings.Builder
	b.WriteByte('"')
	for _, r := range s {
		switch r {
		case '"':
			b.WriteString(`\"`)
		case '\\':
			b.WriteString(`\\`)
		default:
			b.WriteRune(r)
		}
	}
	b.WriteByte('"')
	return b.String()
}
