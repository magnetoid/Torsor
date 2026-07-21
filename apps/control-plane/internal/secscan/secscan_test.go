package secscan

import (
	"strings"
	"testing"
)

func TestScanDetectsCredentialShapes(t *testing.T) {
	// Fixtures are assembled at runtime (prefix + filler) so no literal credential shape
	// exists in this source file — otherwise every OTHER secret scanner (GitHub push
	// protection included) rightly flags the test itself.
	fill := strings.Repeat("a1B2", 10) // 40 chars of key-ish filler
	cases := []struct {
		name    string
		content string
	}{
		{"AWS access key id", `aws_access_key_id = ` + "AKIA" + "IOSFODNN7REALKEY"},
		{"private key block", "-----BEGIN RSA PRIVATE" + " KEY-----\nMIIEpAIB"},
		{"GitHub token", `TOKEN="` + "ghp_" + fill + `"`},
		{"Stripe live key", `const stripe = require("stripe")("` + "sk_live_" + fill[:24] + `");`},
		{"Slack token", `SLACK=` + "xoxb-" + "1234567890-abcdefghij"},
		{"Google API key", `key=` + "AIza" + "SyA1234567890abcdefghijklmnopqrstuv"},
		{"Anthropic API key", `ANTHROPIC_API_KEY=` + "sk-ant-" + "api03-abcdefghijklmnop"},
		{"Postgres URL with password", `DATABASE_URL=` + "postgres://app:supersecretpw@db.internal.prod/appdb"},
	}
	for _, c := range cases {
		findings := Scan(".env", []byte(c.content))
		if len(findings) != 1 {
			t.Errorf("%s: findings = %v, want exactly 1", c.name, findings)
			continue
		}
		if findings[0].Rule != c.name {
			t.Errorf("rule = %q, want %q", findings[0].Rule, c.name)
		}
		// Findings must never carry the matched value.
		if s := findings[0].String(); strings.Contains(s, "sk_live_") || strings.Contains(s, "AKIA") {
			t.Errorf("finding leaks the secret value: %s", s)
		}
	}
}

func TestScanIgnoresCleanAndPlaceholderContent(t *testing.T) {
	clean := []string{
		`const total = items.reduce((a, b) => a + b.price, 0);`,
		`API_KEY=your-key-here`,                                // placeholder cue
		`STRIPE_KEY=` + "sk_live_" + strings.Repeat("X", 24),   // xxxx placeholder
		`token: "{{secret:GITHUB_TOKEN}}"`,                     // Torsor placeholder
		`# add ` + "sk_live_" + `<your key> to .env (example)`, // <...> cue
		`postgres://localhost/dev`,                             // no password
	}
	for _, c := range clean {
		if f := Scan("app.js", []byte(c)); len(f) != 0 {
			t.Errorf("false positive on %q: %v", c, f)
		}
	}
}

func TestScanSkipsBinary(t *testing.T) {
	bin := append([]byte("AKIA"+"IOSFODNN7REALKEY"), 0x00, 0x01)
	if f := Scan("blob.bin", bin); len(f) != 0 {
		t.Errorf("binary content must be skipped, got %v", f)
	}
}

func TestScanReportsLineNumbers(t *testing.T) {
	content := "line one\nline two\n" + "AKIA" + "IOSFODNN7REALKEY\n"
	f := Scan("config.txt", []byte(content))
	if len(f) != 1 || f[0].Line != 3 {
		t.Errorf("findings = %v, want line 3", f)
	}
}

func TestSkipHelpers(t *testing.T) {
	if !SkipDir("node_modules") || SkipDir("src") {
		t.Error("SkipDir wrong")
	}
	if !SkipFile("package-lock.json", 10) || !SkipFile("big.js", maxFileSize+1) || SkipFile("app.js", 100) {
		t.Error("SkipFile wrong")
	}
}
