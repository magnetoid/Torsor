package server

import (
	"testing"

	"github.com/magnetoid/torsor/control-plane/internal/auth"
)

func TestClampInt(t *testing.T) {
	cases := []struct {
		in       string
		def      int
		min, max int
		want     int
	}{
		{"", 50, 1, 200, 50},      // default when absent
		{"abc", 50, 1, 200, 50},   // default when unparseable
		{"25", 50, 1, 200, 25},    // in range
		{"0", 50, 1, 200, 1},      // clamp low
		{"9999", 50, 1, 200, 200}, // clamp high
		{"-3", 0, 0, 1 << 30, 0},  // offset floor
	}
	for _, c := range cases {
		if got := clampInt(c.in, c.def, c.min, c.max); got != c.want {
			t.Errorf("clampInt(%q, %d, %d, %d) = %d, want %d", c.in, c.def, c.min, c.max, got, c.want)
		}
	}
}

// The role gate must mirror apps/api: admin routes admit admin+super_admin, the role
// mutation route admits super_admin only, plain users are always below both bars.
func TestRoleRankGate(t *testing.T) {
	cases := []struct {
		caller  auth.Role
		minimum auth.Role
		allowed bool
	}{
		{auth.RoleUser, auth.RoleAdmin, false},
		{auth.RoleAdmin, auth.RoleAdmin, true},
		{auth.RoleSuperAdmin, auth.RoleAdmin, true},
		{auth.RoleUser, auth.RoleSuperAdmin, false},
		{auth.RoleAdmin, auth.RoleSuperAdmin, false},
		{auth.RoleSuperAdmin, auth.RoleSuperAdmin, true},
	}
	for _, c := range cases {
		if got := roleRank[c.caller] >= roleRank[c.minimum]; got != c.allowed {
			t.Errorf("rank(%q) >= rank(%q) = %v, want %v", c.caller, c.minimum, got, c.allowed)
		}
	}
}

// An unknown role string must be rejected by the role-change validation (it relies on
// roleRank membership), so a typo can never be written to the users table.
func TestRoleValidationRejectsUnknown(t *testing.T) {
	for _, bad := range []string{"", "root", "superadmin", "ADMIN"} {
		if _, ok := roleRank[auth.Role(bad)]; ok {
			t.Errorf("role %q unexpectedly valid", bad)
		}
	}
	for _, good := range []string{"user", "admin", "super_admin"} {
		if _, ok := roleRank[auth.Role(good)]; !ok {
			t.Errorf("role %q unexpectedly invalid", good)
		}
	}
}
