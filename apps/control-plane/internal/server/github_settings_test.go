package server

import "testing"

// encrypt fake: prefixes so we can assert what got "encrypted".
func fakeEncrypt(s string) (string, error) { return "enc:" + s, nil }

func TestApplyGitHubPatch_SetsAndEncrypts(t *testing.T) {
	cur := githubSettingsRow{}
	appID := "123"
	secret := "shhh"
	enabled := true
	next, err := applyGitHubPatch(cur, githubSettingsPatch{
		AppID:        &appID,
		ClientSecret: &secret,
		Enabled:      &enabled,
	}, fakeEncrypt)
	if err != nil {
		t.Fatalf("apply: %v", err)
	}
	if next.AppID != "123" {
		t.Errorf("appID = %q", next.AppID)
	}
	if next.ClientSecretEnc != "enc:shhh" {
		t.Errorf("clientSecretEnc = %q, want enc:shhh", next.ClientSecretEnc)
	}
	if !next.Enabled {
		t.Errorf("enabled not set")
	}
}

func TestApplyGitHubPatch_PreservesUnsetSecrets(t *testing.T) {
	cur := githubSettingsRow{ClientSecretEnc: "enc:existing", PrivateKeyEnc: "enc:key"}
	empty := "" // explicit empty must NOT wipe an existing secret
	appSlug := "my-app"
	next, err := applyGitHubPatch(cur, githubSettingsPatch{
		AppSlug:      &appSlug,
		ClientSecret: &empty,
	}, fakeEncrypt)
	if err != nil {
		t.Fatalf("apply: %v", err)
	}
	if next.ClientSecretEnc != "enc:existing" {
		t.Errorf("secret wiped: %q", next.ClientSecretEnc)
	}
	if next.PrivateKeyEnc != "enc:key" {
		t.Errorf("private key changed: %q", next.PrivateKeyEnc)
	}
	if next.AppSlug != "my-app" {
		t.Errorf("appSlug = %q", next.AppSlug)
	}
}
