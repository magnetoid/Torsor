// Package secscan is a focused secret scanner for the deploy gate: before a project's app
// is published to a public URL, its workspace files are scanned for credential material so
// a vibe-coded app can't ship a hardcoded live key (45% of unreviewed AI-generated samples
// carry an OWASP Top-10 issue; hardcoded secrets are a dominant class). The pattern set is
// deliberately small and high-confidence — a provider-prefixed token has essentially no
// false positives, and a noisy gate would just get disabled. (A full gitleaks integration
// was considered; its rule corpus and git-history walking are far more than this gate
// needs — ADR 0010 bloat exception, decision recorded.)
package secscan

import (
	"bytes"
	"fmt"
	"regexp"
	"strings"
)

// Finding is one detected secret. The matched value is intentionally NOT carried — only
// where and what kind, so findings are safe to log and return to the UI.
type Finding struct {
	Path string `json:"path"`
	Line int    `json:"line"`
	Rule string `json:"rule"`
}

func (f Finding) String() string { return fmt.Sprintf("%s:%d — %s", f.Path, f.Line, f.Rule) }

type rule struct {
	name string
	re   *regexp.Regexp
}

// rules are high-confidence, provider-prefixed credential shapes.
var rules = []rule{
	{"AWS access key id", regexp.MustCompile(`\bAKIA[0-9A-Z]{16}\b`)},
	{"private key block", regexp.MustCompile(`-----BEGIN (RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY( BLOCK)?-----`)},
	{"GitHub token", regexp.MustCompile(`\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{22,}\b`)},
	{"Stripe live key", regexp.MustCompile(`\b[sr]k_live_[A-Za-z0-9]{20,}\b`)},
	{"Slack token", regexp.MustCompile(`\bxox[baprs]-[A-Za-z0-9-]{10,}\b`)},
	{"Google API key", regexp.MustCompile(`\bAIza[0-9A-Za-z_\-]{35}\b`)},
	{"Anthropic API key", regexp.MustCompile(`\bsk-ant-[A-Za-z0-9_\-]{20,}\b`)},
	{"OpenAI API key", regexp.MustCompile(`\bsk-(proj-)?[A-Za-z0-9_\-]{40,}\b`)},
	{"npm token", regexp.MustCompile(`\bnpm_[A-Za-z0-9]{36}\b`)},
	{"Postgres URL with password", regexp.MustCompile(`\bpostgres(ql)?://[^/\s:]+:[^@\s]{8,}@`)},
}

const (
	maxFileSize    = 256 * 1024 // larger files are skipped (minified bundles, data blobs)
	maxFindings    = 20
	placeholderCue = "example|placeholder|your[_-]?key|xxxx|<.*>|\\{\\{.*\\}\\}"
)

var placeholderRe = regexp.MustCompile(`(?i)` + placeholderCue)

// skipDirs are never descended into: dependency trees and build output are third-party
// noise, and .git history is out of scope for a pre-publish content gate.
var skipDirs = map[string]bool{
	"node_modules": true, ".git": true, "dist": true, "build": true, ".next": true,
	"vendor": true, ".cache": true, "coverage": true, "__pycache__": true,
}

// skipFiles are exact-name skips (lockfiles carry integrity hashes, not secrets).
var skipFiles = map[string]bool{
	"package-lock.json": true, "yarn.lock": true, "pnpm-lock.yaml": true, "go.sum": true,
}

// SkipDir reports whether a directory name must not be descended into.
func SkipDir(name string) bool { return skipDirs[name] }

// SkipFile reports whether a file should not be scanned (by name or size), or looks binary.
func SkipFile(name string, size int) bool {
	return skipFiles[name] || size > maxFileSize
}

// Scan checks one file's content and returns its findings (bounded). Binary content
// (NUL byte in the first 8KB) is skipped; lines that look like documented placeholders
// ("your-key-here", "{{...}}") are ignored.
func Scan(path string, content []byte) []Finding {
	head := content
	if len(head) > 8192 {
		head = head[:8192]
	}
	if bytes.IndexByte(head, 0) >= 0 {
		return nil // binary
	}
	var findings []Finding
	for lineNo, line := range strings.Split(string(content), "\n") {
		if len(findings) >= maxFindings {
			break
		}
		for _, r := range rules {
			if !r.re.MatchString(line) {
				continue
			}
			if placeholderRe.MatchString(line) {
				continue // documented example, not a live credential
			}
			findings = append(findings, Finding{Path: path, Line: lineNo + 1, Rule: r.name})
			break // one finding per line is enough
		}
	}
	return findings
}
