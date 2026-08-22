package server

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"net"
	"strings"
	"time"
)

// DNS TXT ownership challenge for custom domains.
//
// Attaching a hostname is a claim; publishing a TXT record only the domain's DNS operator can
// write is the proof. Until that proof lands, the mapping exists but is not routable, so an
// unproven claim cannot make Torsor answer for someone else's domain.

// challengePrefix is the label the TXT record lives under, e.g.
// _torsor-challenge.app.example.com. An underscore-prefixed label cannot collide with a real
// host and is the convention every ACME/verification flow uses.
const challengePrefix = "_torsor-challenge"

// dnsTimeout bounds a verification attempt. A user is waiting on this request, and an
// unreachable authoritative server must not hold a connection open indefinitely.
const dnsTimeout = 5 * time.Second

// txtResolver is the slice of net.Resolver this package needs, so tests can drive verification
// without a network or a live zone.
type txtResolver interface {
	LookupTXT(ctx context.Context, name string) ([]string, error)
}

// challengeHost is where the token must be published for the given domain.
func challengeHost(domain string) string { return challengePrefix + "." + domain }

// newVerificationToken returns a fresh challenge value. crypto/rand, not math/rand: a
// guessable token would let an attacker publish the expected record on a domain whose DNS
// they control and pass verification for a domain they do not.
func newVerificationToken() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// txtMatches reports whether any record carries the expected token.
//
// Two details matter. Records are compared with constant-time equality so the check cannot be
// turned into an oracle that leaks a token byte by byte. And long TXT values arrive split into
// 255-byte strings, which some resolvers hand back as separate slice entries and others
// pre-joined, so the concatenation is checked as well as the individual records.
func txtMatches(records []string, token string) bool {
	if token == "" {
		return false
	}
	want := []byte(token)
	var joined strings.Builder
	for _, rec := range records {
		rec = strings.TrimSpace(rec)
		if subtle.ConstantTimeCompare([]byte(rec), want) == 1 {
			return true
		}
		joined.WriteString(rec)
	}
	return subtle.ConstantTimeCompare([]byte(strings.TrimSpace(joined.String())), want) == 1
}

// verifyDomainTXT looks up the challenge record and reports whether the token is present.
// A lookup error and a missing record are the same outcome to the caller — unverified — but
// the error is returned so the handler can tell the user *why* it failed (NXDOMAIN reads very
// differently from "record found, wrong value").
func verifyDomainTXT(ctx context.Context, res txtResolver, domain, token string) (bool, error) {
	ctx, cancel := context.WithTimeout(ctx, dnsTimeout)
	defer cancel()

	records, err := res.LookupTXT(ctx, challengeHost(domain))
	if err != nil {
		return false, err
	}
	return txtMatches(records, token), nil
}

// resolver returns the server's TXT resolver, defaulting to the process resolver.
func (s *Server) resolver() txtResolver {
	if s.txtLookup != nil {
		return s.txtLookup
	}
	return net.DefaultResolver
}
