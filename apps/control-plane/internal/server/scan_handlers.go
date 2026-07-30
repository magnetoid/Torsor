package server

// Real security scanning for the Security tab, replacing a UI that faked progress and
// showed hardcoded findings. Two honest sources, both run inside the project's own
// workspace container:
//
//   - secrets: the same detectors that already gate deploys (internal/secscan), so what
//     the tab reports and what blocks a publish can never disagree;
//   - dependencies: OSS scanners invoked if the workspace has them — `npm audit` for
//     Node projects, `osv-scanner` and `govulncheck` when installed.
//
// Scanners that aren't present are reported as "unavailable" rather than silently
// skipped: a clean report must mean "we looked", not "we couldn't look".

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/magnetoid/torsor/control-plane/internal/plugin"
)

type scanIssue struct {
	Severity    string `json:"severity"` // critical | warning | info
	Title       string `json:"title"`
	File        string `json:"file"`
	Line        int    `json:"line"`
	Description string `json:"description"`
	Source      string `json:"source"` // which scanner produced it
}

type scannerResult struct {
	Name      string `json:"name"`
	Ran       bool   `json:"ran"`
	Available bool   `json:"available"`
	Detail    string `json:"detail"`
}

func (s *Server) handleWorkspaceScan(w http.ResponseWriter, r *http.Request) {
	ws, rt, ok := s.loadWorkspace(w, r)
	if !ok {
		return
	}
	ctx := r.Context()
	issues := []scanIssue{}
	scanners := []scannerResult{}

	// 1) Secrets — always available (implemented in Go, walks the container FS).
	secretFindings := scanWorkspaceSecrets(ctx, rt, ws.ProjectID)
	for _, f := range secretFindings {
		issues = append(issues, scanIssue{
			Severity:    "critical",
			Title:       "Possible secret committed: " + f.Rule,
			File:        f.Path,
			Line:        f.Line,
			Description: "A value matching the " + f.Rule + " pattern was found in this file. Move it into a secret (Settings → API Keys) and reference it from the environment. This finding also blocks publishing.",
			Source:      "secrets",
		})
	}
	scanners = append(scanners, scannerResult{
		Name: "secrets", Ran: true, Available: true,
		Detail: fmt.Sprintf("%d finding(s)", len(secretFindings)),
	})

	// 2) npm audit — only meaningful when the project has a lockfile to audit.
	if out, exit, err := s.execOut2(ctx, rt, ws.ProjectID, "sh", "-c",
		"test -f package.json && command -v npm >/dev/null && npm audit --json 2>/dev/null || echo __UNAVAILABLE__"); err == nil {
		if strings.Contains(out, "__UNAVAILABLE__") {
			scanners = append(scanners, scannerResult{
				Name: "npm audit", Available: false,
				Detail: "no package.json, or npm is not installed in this workspace",
			})
		} else {
			found, detail := parseNPMAudit(out)
			issues = append(issues, found...)
			scanners = append(scanners, scannerResult{Name: "npm audit", Ran: true, Available: true, Detail: detail})
			_ = exit // npm audit exits non-zero when vulnerabilities exist; that's data, not failure
		}
	}

	// 3) osv-scanner / govulncheck — used when the image provides them.
	for _, sc := range []struct{ name, probe string }{
		{"osv-scanner", "command -v osv-scanner >/dev/null && osv-scanner --format json ./ 2>/dev/null || echo __UNAVAILABLE__"},
		{"govulncheck", "test -f go.mod && command -v govulncheck >/dev/null && govulncheck ./... 2>&1 || echo __UNAVAILABLE__"},
	} {
		out, _, err := s.execOut2(ctx, rt, ws.ProjectID, "sh", "-c", sc.probe)
		if err != nil || strings.Contains(out, "__UNAVAILABLE__") {
			scanners = append(scanners, scannerResult{
				Name: sc.name, Available: false,
				Detail: "not installed in this workspace",
			})
			continue
		}
		if sc.name == "osv-scanner" {
			found, detail := parseOSV(out)
			issues = append(issues, found...)
			scanners = append(scanners, scannerResult{Name: sc.name, Ran: true, Available: true, Detail: detail})
			continue
		}
		clean := strings.TrimSpace(out)
		detail := "no vulnerabilities reported"
		if strings.Contains(clean, "Vulnerability") {
			issues = append(issues, scanIssue{
				Severity: "warning", Title: "govulncheck reported vulnerabilities",
				File: "go.mod", Description: truncateText(clean, 1500), Source: "govulncheck",
			})
			detail = "vulnerabilities reported"
		}
		scanners = append(scanners, scannerResult{Name: sc.name, Ran: true, Available: true, Detail: detail})
	}

	writeJSON(w, http.StatusOK, map[string]any{"issues": issues, "scanners": scanners})
}

// execOut2 collects a command's combined stdout+stderr and exit code from the workspace.
// Scanners write findings to either stream, so both are kept.
func (s *Server) execOut2(ctx context.Context, rt plugin.WorkspaceRuntime, projectID string, cmd ...string) (string, int32, error) {
	out, errOut, exit, err := s.execOut(ctx, rt, projectID, cmd...)
	return out + errOut, exit, err
}

// parseNPMAudit turns `npm audit --json` into issues. npm's schema differs across major
// versions, so only the stable `vulnerabilities` map is read and anything unexpected
// degrades to "no parseable findings" rather than a fabricated clean bill of health.
func parseNPMAudit(out string) ([]scanIssue, string) {
	start := strings.Index(out, "{")
	if start < 0 {
		return nil, "no parseable output"
	}
	var parsed struct {
		Vulnerabilities map[string]struct {
			Severity string `json:"severity"`
			Via      []any  `json:"via"`
			Range    string `json:"range"`
		} `json:"vulnerabilities"`
	}
	if err := json.Unmarshal([]byte(out[start:]), &parsed); err != nil {
		return nil, "no parseable output"
	}
	issues := []scanIssue{}
	for name, v := range parsed.Vulnerabilities {
		sev := "info"
		switch v.Severity {
		case "critical", "high":
			sev = "critical"
		case "moderate":
			sev = "warning"
		}
		desc := fmt.Sprintf("npm audit reports a %s severity advisory for %s", v.Severity, name)
		if v.Range != "" {
			desc += " (affected range: " + v.Range + ")"
		}
		desc += ". Run `npm audit fix` in the Terminal, or update the dependency."
		issues = append(issues, scanIssue{
			Severity: sev, Title: "Vulnerable dependency: " + name,
			File: "package.json", Description: desc, Source: "npm audit",
		})
	}
	return issues, fmt.Sprintf("%d vulnerable package(s)", len(issues))
}

// parseOSV reads osv-scanner's JSON output into issues.
func parseOSV(out string) ([]scanIssue, string) {
	start := strings.Index(out, "{")
	if start < 0 {
		return nil, "no parseable output"
	}
	var parsed struct {
		Results []struct {
			Source struct {
				Path string `json:"path"`
			} `json:"source"`
			Packages []struct {
				Package struct {
					Name string `json:"name"`
				} `json:"package"`
				Vulnerabilities []struct {
					ID      string `json:"id"`
					Summary string `json:"summary"`
				} `json:"vulnerabilities"`
			} `json:"packages"`
		} `json:"results"`
	}
	if err := json.Unmarshal([]byte(out[start:]), &parsed); err != nil {
		return nil, "no parseable output"
	}
	issues := []scanIssue{}
	for _, res := range parsed.Results {
		for _, pkg := range res.Packages {
			for _, v := range pkg.Vulnerabilities {
				summary := v.Summary
				if summary == "" {
					summary = "See the advisory for details."
				}
				issues = append(issues, scanIssue{
					Severity: "warning",
					Title:    v.ID + " in " + pkg.Package.Name,
					File:     res.Source.Path,
					Description: summary + " Update " + pkg.Package.Name +
						" to a patched version.",
					Source: "osv-scanner",
				})
			}
		}
	}
	return issues, fmt.Sprintf("%d advisory finding(s)", len(issues))
}

func truncateText(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "…"
}
