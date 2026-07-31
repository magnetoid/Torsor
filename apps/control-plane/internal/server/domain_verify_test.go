package server

import (
	"context"
	"errors"
	"strings"
	"testing"
)

type fakeResolver struct {
	records []string
	err     error
	asked   string
}

func (f *fakeResolver) LookupTXT(_ context.Context, name string) ([]string, error) {
	f.asked = name
	return f.records, f.err
}

func TestChallengeHostUsesUnderscoreLabel(t *testing.T) {
	if got, want := challengeHost("app.example.com"), "_torsor-challenge.app.example.com"; got != want {
		t.Fatalf("challengeHost = %q, want %q", got, want)
	}
}

func TestNewVerificationTokenIsRandomAndHex(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 100; i++ {
		tok, err := newVerificationToken()
		if err != nil {
			t.Fatalf("newVerificationToken: %v", err)
		}
		if len(tok) != 32 {
			t.Fatalf("token %q has length %d, want 32 hex chars (128 bits)", tok, len(tok))
		}
		if strings.Trim(tok, "0123456789abcdef") != "" {
			t.Fatalf("token %q is not lowercase hex", tok)
		}
		if seen[tok] {
			t.Fatalf("token %q repeated — tokens must be unpredictable", tok)
		}
		seen[tok] = true
	}
}

func TestTxtMatches(t *testing.T) {
	const token = "0123456789abcdef0123456789abcdef"
	cases := []struct {
		name    string
		records []string
		token   string
		want    bool
	}{
		{"exact match", []string{token}, token, true},
		{"among other records", []string{"v=spf1 -all", token, "other"}, token, true},
		{"surrounding whitespace tolerated", []string{"  " + token + "  "}, token, true},
		// Resolvers differ: some return a >255-byte value pre-joined, some as chunks.
		{"chunked value", []string{token[:16], token[16:]}, token, true},
		{"no records", nil, token, false},
		{"wrong value", []string{"not-the-token"}, token, false},
		{"prefix only is not a match", []string{token[:16]}, token, false},
		{"token with extra suffix", []string{token + "extra"}, token, false},
		// An empty token must never be satisfiable, or a row with no challenge would verify
		// against a domain publishing an empty TXT record.
		{"empty token never matches", []string{""}, "", false},
		{"empty token vs empty record", []string{}, "", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := txtMatches(tc.records, tc.token); got != tc.want {
				t.Fatalf("txtMatches(%q, %q) = %v, want %v", tc.records, tc.token, got, tc.want)
			}
		})
	}
}

func TestVerifyDomainTXTQueriesChallengeHost(t *testing.T) {
	const token = "0123456789abcdef0123456789abcdef"
	f := &fakeResolver{records: []string{token}}

	ok, err := verifyDomainTXT(context.Background(), f, "app.example.com", token)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !ok {
		t.Fatal("verifyDomainTXT = false, want true")
	}
	// Must query the challenge label, never the bare domain — looking up the apex would let a
	// domain that merely has *some* TXT record pass.
	if f.asked != "_torsor-challenge.app.example.com" {
		t.Fatalf("looked up %q, want the challenge host", f.asked)
	}
}

func TestVerifyDomainTXTReportsLookupFailure(t *testing.T) {
	f := &fakeResolver{err: errors.New("NXDOMAIN")}

	ok, err := verifyDomainTXT(context.Background(), f, "app.example.com", "tok")
	if ok {
		t.Fatal("verifyDomainTXT = true on a failed lookup; must never verify")
	}
	if err == nil {
		t.Fatal("expected the lookup error to be returned so the handler can explain the failure")
	}
}

func TestVerifyDomainTXTRejectsWrongToken(t *testing.T) {
	f := &fakeResolver{records: []string{"someone-elses-token"}}

	ok, err := verifyDomainTXT(context.Background(), f, "app.example.com", "0123456789abcdef0123456789abcdef")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ok {
		t.Fatal("verified against a record that does not carry our token")
	}
}
