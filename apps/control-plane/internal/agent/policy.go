package agent

import (
	"regexp"
	"strings"
)

// Destructive-command policy: the direct lesson of the 2025 Replit incident (an agent
// deleted a production database during a code freeze). A hijacked or confused agent must
// not be able to run irreversible commands unattended — blocked commands come back as an
// observation so the agent adapts (and can ask the user to run the command themselves),
// rather than the run aborting. This guards the workspace boundary, not the internet: the
// workspace itself is disposable but the user's data and the host are not.

type destructiveRule struct {
	re     *regexp.Regexp
	reason string
}

var destructiveRules = []destructiveRule{
	// rm -rf against root/home/parent or absolute paths outside the workspace.
	{regexp.MustCompile(`(?i)\brm\s+(-[a-z]*r[a-z]*f[a-z]*|-[a-z]*f[a-z]*r[a-z]*)\s+(--\S+\s+)*("|')?(/|~|\.\.|\$HOME)`), "recursive force-delete outside the workspace"},
	// Database destruction.
	{regexp.MustCompile(`(?i)\bdrop\s+(database|schema)\b`), "dropping a database/schema"},
	{regexp.MustCompile(`(?i)\btruncate\s+table\b.*(prod|production)`), "truncating a production table"},
	// Git history destruction on shared remotes.
	{regexp.MustCompile(`(?i)\bgit\s+push\s+(\S+\s+)*(--force\b|-f\b)`), "force-pushing (rewrites shared history)"},
	// Piping a remote script straight into a shell (supply-chain / injection classic).
	{regexp.MustCompile(`(?i)\b(curl|wget)\b[^|;&]*\|\s*(sudo\s+)?(ba)?sh\b`), "piping a downloaded script into a shell"},
	// Disk / system destruction.
	{regexp.MustCompile(`(?i)\b(mkfs|fdisk|parted)\b`), "reformatting or repartitioning a disk"},
	{regexp.MustCompile(`(?i)\bdd\b.*\bof=/dev/`), "raw-writing to a device"},
	{regexp.MustCompile(`(?i)\b(shutdown|reboot|halt|poweroff)\b`), "shutting down the machine"},
	// Host Docker control from inside a run (the workspace must not manage containers).
	{regexp.MustCompile(`(?i)\bdocker\s+(system\s+prune|rm|rmi|volume\s+rm|network\s+rm)\b`), "destroying Docker resources"},
	// Fork bomb.
	{regexp.MustCompile(`:\(\)\s*\{\s*:\|:\s*&\s*\}\s*;`), "fork bomb"},
	// Recursive world-writable permissions from the root.
	{regexp.MustCompile(`(?i)\bchmod\s+(-[a-z]*R[a-z]*\s+)?(777|a\+rwx)\s+("|')?/(\s|$|")`), "world-writable permissions on /"},
}

// destructiveReason returns a human-readable reason when cmd matches a destructive
// pattern, or "" when the command is allowed.
func destructiveReason(cmd string) string {
	c := strings.TrimSpace(cmd)
	if c == "" {
		return ""
	}
	for _, r := range destructiveRules {
		if r.re.MatchString(c) {
			return r.reason
		}
	}
	return ""
}
