package server

import (
	"context"
	"os"
	"strings"

	"github.com/magnetoid/torsor/control-plane/internal/plugin"
	"github.com/magnetoid/torsor/control-plane/internal/secscan"
)

// Deploy gate: before a project is published to a public URL, its workspace files are
// scanned for credential material (internal/secscan). A hit blocks the deploy with the
// finding locations (never the values) so the user can remove the secret — or move it to
// the encrypted secrets store and use {{secret:NAME}} placeholders instead.

const (
	scanMaxFiles = 400
	scanMaxDepth = 6
)

// deployScanEnabled: on unless explicitly disabled (TORSOR_DEPLOY_SCAN=off).
func deployScanEnabled() bool {
	return !strings.EqualFold(strings.TrimSpace(os.Getenv("TORSOR_DEPLOY_SCAN")), "off")
}

// scanWorkspaceSecrets walks the workspace tree (bounded in files and depth, skipping
// dependency/build dirs) and returns all secret findings. Walk errors are swallowed
// per-entry: an unreadable file must not block the scan of the rest, and the gate's
// job is best-effort detection, not proof of absence.
func scanWorkspaceSecrets(ctx context.Context, rt plugin.WorkspaceRuntime, projectID string) []secscan.Finding {
	var findings []secscan.Finding
	scanned := 0

	var walk func(path string, depth int)
	walk = func(path string, depth int) {
		if depth > scanMaxDepth || scanned >= scanMaxFiles || ctx.Err() != nil {
			return
		}
		entries, err := rt.ListFiles(ctx, projectID, path)
		if err != nil {
			return
		}
		for _, e := range entries {
			if scanned >= scanMaxFiles {
				return
			}
			if e.IsDir {
				if !secscan.SkipDir(e.Name) {
					walk(e.Path, depth+1)
				}
				continue
			}
			if secscan.SkipFile(e.Name, int(e.Size)) {
				continue
			}
			content, err := rt.ReadFile(ctx, projectID, e.Path)
			if err != nil {
				continue
			}
			scanned++
			findings = append(findings, secscan.Scan(e.Path, content)...)
		}
	}
	walk("", 0)
	return findings
}
