package server

import (
	"testing"

	"github.com/magnetoid/torsor/control-plane/internal/auth"
	"github.com/magnetoid/torsor/control-plane/internal/config"
)

func TestResolveRole(t *testing.T) {
	s := &Server{cfg: config.Config{SuperAdminEmails: []string{"boss@torsor.dev"}}}
	cases := []struct {
		email string
		db    auth.Role
		want  auth.Role
	}{
		{"x@y.com", auth.RoleAdmin, auth.RoleAdmin},             // keep DB admin
		{"x@y.com", auth.RoleSuperAdmin, auth.RoleSuperAdmin},   // keep DB super_admin
		{"x@y.com", auth.RoleUser, auth.RoleUser},               // plain user
		{"boss@torsor.dev", auth.RoleUser, auth.RoleSuperAdmin}, // email promotion
		{"BOSS@torsor.dev", auth.RoleUser, auth.RoleSuperAdmin}, // case-insensitive
		{"x@y.com", auth.Role(""), auth.RoleUser},               // empty -> user
	}
	for _, c := range cases {
		if got := s.resolveRole(c.email, c.db); got != c.want {
			t.Errorf("resolveRole(%q, %q) = %q, want %q", c.email, c.db, got, c.want)
		}
	}
}

func TestSlugify(t *testing.T) {
	cases := []struct {
		name, email, want string
	}{
		{"Ada Lovelace", "a@b.com", "ada-lovelace"},
		{"Foo!! Bar", "x@y.com", "foo-bar"},
		{"   ", "ada@example.com", "ada"}, // falls back to email local part
		{"--Edge--", "x@y.com", "edge"},
	}
	for _, c := range cases {
		if got := slugify(c.name, c.email); got != c.want {
			t.Errorf("slugify(%q, %q) = %q, want %q", c.name, c.email, got, c.want)
		}
	}
}
