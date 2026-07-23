package server

import (
	"testing"
	"time"

	"github.com/magnetoid/torsor/control-plane/internal/config"
)

func newTokenServer() *Server {
	return &Server{cfg: config.Config{SecretKey: "unit-test-secret-key"}}
}

func TestSignedTokenRoundTrip(t *testing.T) {
	s := newTokenServer()
	tok := s.signSignedToken("state", "nonce-123", time.Minute)
	got, err := s.verifySignedToken("state", tok)
	if err != nil {
		t.Fatalf("verify error: %v", err)
	}
	if got != "nonce-123" {
		t.Errorf("data = %q, want nonce-123", got)
	}
}

func TestSignedTokenExpired(t *testing.T) {
	s := newTokenServer()
	tok := s.signSignedToken("state", "x", -time.Second)
	if _, err := s.verifySignedToken("state", tok); err == nil {
		t.Fatal("expected expiry error, got nil")
	}
}

func TestSignedTokenTampered(t *testing.T) {
	s := newTokenServer()
	tok := s.signSignedToken("state", "x", time.Minute)
	if _, err := s.verifySignedToken("state", tok+"z"); err == nil {
		t.Fatal("expected tamper error, got nil")
	}
}

func TestSignedTokenWrongPurpose(t *testing.T) {
	s := newTokenServer()
	tok := s.signSignedToken("state", "x", time.Minute)
	if _, err := s.verifySignedToken("handoff", tok); err == nil {
		t.Fatal("expected purpose-mismatch error, got nil")
	}
}
