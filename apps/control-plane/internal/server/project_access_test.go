package server

import (
	"strings"
	"testing"
)

// The predicate is the single authorization gate for every project-scoped route, so
// its exact shape is worth pinning: owner branch present (belt-and-braces), team
// branch restricted to active non-viewer memberships, alias applied to both columns.
func TestProjectAccessSQL(t *testing.T) {
	tests := []struct {
		name      string
		alias     string
		userParam int
		want      string
	}{
		{
			name:      "unaliased",
			alias:     "",
			userParam: 2,
			want:      `(user_id = $2 OR team_id IN (SELECT team_id FROM team_members WHERE user_id = $2 AND status = 'active' AND role <> 'viewer'))`,
		},
		{
			name:      "aliased for joins",
			alias:     "p.",
			userParam: 1,
			want:      `(p.user_id = $1 OR p.team_id IN (SELECT team_id FROM team_members WHERE user_id = $1 AND status = 'active' AND role <> 'viewer'))`,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := projectAccessSQL(tt.alias, tt.userParam)
			if got != tt.want {
				t.Fatalf("projectAccessSQL(%q, %d)\n got: %s\nwant: %s", tt.alias, tt.userParam, got, tt.want)
			}
		})
	}
}

func TestProjectAccessSQLInvariants(t *testing.T) {
	got := projectAccessSQL("p.", 3)
	// Inactive members must never pass, and viewers must not get write-capable access.
	for _, must := range []string{"status = 'active'", "role <> 'viewer'", "p.user_id = $3", "p.team_id"} {
		if !strings.Contains(got, must) {
			t.Errorf("predicate missing %q: %s", must, got)
		}
	}
	// The inner membership lookup must not inherit the outer alias.
	if strings.Contains(got, "WHERE p.user_id = $3 AND status") {
		t.Errorf("alias leaked into the team_members subquery: %s", got)
	}
}

// Roles used to be arbitrary client strings; anything except 'viewer' now grants
// write-capable project access, so the allowlist is part of the security boundary.
func TestValidTeamRole(t *testing.T) {
	valid := []string{"admin", "developer", "viewer"}
	for _, r := range valid {
		if !validTeamRole(r) {
			t.Errorf("validTeamRole(%q) = false, want true", r)
		}
	}
	invalid := []string{"owner", "", "Editor", "ADMIN", "root", "member", "developer ", "super_admin"}
	for _, r := range invalid {
		if validTeamRole(r) {
			t.Errorf("validTeamRole(%q) = true, want false", r)
		}
	}
}
