package auth

import (
	"testing"
	"time"
)

func TestPasswordHashRoundTrip(t *testing.T) {
	hash, err := HashPassword("password123")
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}
	if !VerifyPassword("password123", hash) {
		t.Error("VerifyPassword should accept the correct password")
	}
	if VerifyPassword("wrongpassword", hash) {
		t.Error("VerifyPassword should reject an incorrect password")
	}
}

func TestTokenRoundTrip(t *testing.T) {
	m := NewManager(nil, "test-secret-at-least-32-chars-long-xx", time.Hour)
	token, err := m.SignToken("user-1", "user@example.com", "session-9")
	if err != nil {
		t.Fatalf("SignToken: %v", err)
	}
	claims, err := m.ParseToken(token)
	if err != nil {
		t.Fatalf("ParseToken: %v", err)
	}
	if claims.UserID != "user-1" || claims.Email != "user@example.com" || claims.SessionID != "session-9" {
		t.Errorf("claims mismatch: %+v", claims)
	}
}

func TestParseTokenRejectsGarbage(t *testing.T) {
	m := NewManager(nil, "test-secret-at-least-32-chars-long-xx", time.Hour)
	if _, err := m.ParseToken("not-a-jwt"); err == nil {
		t.Error("ParseToken should reject a malformed token")
	}
}

func TestParseTokenRejectsWrongSecret(t *testing.T) {
	signer := NewManager(nil, "secret-one-secret-one-secret-one-xx", time.Hour)
	token, _ := signer.SignToken("u", "e@x.com", "s")
	verifier := NewManager(nil, "secret-two-secret-two-secret-two-xx", time.Hour)
	if _, err := verifier.ParseToken(token); err == nil {
		t.Error("ParseToken should reject a token signed with a different secret")
	}
}
