package server

import "testing"

func TestDecideGitHubAccount(t *testing.T) {
	cases := []struct {
		name         string
		identityUser string
		emailUser    string
		allowSignup  bool
		wantAction   ghAction
		wantUser     string
	}{
		{"existing identity wins", "u1", "u2", true, ghUseUser, "u1"},
		{"link by verified email", "", "u2", true, ghLinkExisting, "u2"},
		{"new signup when allowed", "", "", true, ghSignup, ""},
		{"denied when signup off", "", "", false, ghDenied, ""},
		{"identity beats signup-off", "u1", "", false, ghUseUser, "u1"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			act, user := decideGitHubAccount(c.identityUser, c.emailUser, c.allowSignup)
			if act != c.wantAction || user != c.wantUser {
				t.Errorf("got (%d, %q), want (%d, %q)", act, user, c.wantAction, c.wantUser)
			}
		})
	}
}
