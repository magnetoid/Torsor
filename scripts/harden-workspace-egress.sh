#!/bin/sh
# Harden workspace egress: firewall the dedicated workspace Docker network so agent /
# user code in workspaces cannot pivot into cloud metadata or internal networks, while
# keeping ordinary internet access (npm install, API calls) working.
#
# Blocks, from the workspace subnet:
#   - 169.254.0.0/16   link-local / cloud metadata (the SSRF-to-credentials classic)
#   - 10/8, 172.16/12, 192.168/16   private ranges (internal pivots; docker infra excepted)
# Allows: DNS, established/related return traffic, and the public internet.
#
# Usage (as root, on the host running the workspace containers):
#   TORSOR_WS_NETWORK=torsor-ws ./scripts/harden-workspace-egress.sh
#
# Rules are inserted into DOCKER-USER (the chain Docker guarantees is consulted for all
# container traffic and never rewrites). Idempotent: existing torsor rules are replaced.
# NOTE: rules do not survive reboot by themselves — persist with your distro's
# iptables-persistent/nftables mechanism (see docs/PRODUCTION-HARDENING.md).
set -eu

NET="${TORSOR_WS_NETWORK:-torsor-ws}"
COMMENT="torsor-ws-egress"

SUBNET="$(docker network inspect "$NET" --format '{{ (index .IPAM.Config 0).Subnet }}' 2>/dev/null)" || {
  echo "error: docker network '$NET' not found. Create it (the docker-runtime plugin auto-creates it when TORSOR_WS_NETWORK=$NET) and re-run." >&2
  exit 1
}
echo "workspace network: $NET  subnet: $SUBNET"

# Wipe previous torsor rules (match by comment), then insert fresh ones at the top.
iptables -S DOCKER-USER | grep -- "--comment $COMMENT" | sed 's/^-A //' | while read -r rule; do
  # shellcheck disable=SC2086
  iptables -D $rule || true
done

# The workspace app port (previews/deploys are proxied to it by the control plane).
APP_PORT="${TORSOR_WS_APP_PORT:-3000}"

# Inbound preview path MUST be ACCEPT (not RETURN): docker's inter-bridge isolation
# (DOCKER-ISOLATION-STAGE-2) would otherwise DROP the DNAT'd forward from the
# control-plane's network into this user-defined bridge — host->port works, container->port
# doesn't. ACCEPT in DOCKER-USER short-circuits the isolation chains for exactly this path.
iptables -I DOCKER-USER 1 -d "$SUBNET" -p tcp --dport "$APP_PORT" -j ACCEPT \
  -m comment --comment "$COMMENT"
# Return traffic for connections in either direction (also ACCEPT: replies from the
# workspace to the control-plane's bridge would hit the same isolation DROP).
iptables -I DOCKER-USER 2 -s "$SUBNET" -m state --state ESTABLISHED,RELATED -j ACCEPT \
  -m comment --comment "$COMMENT"
# The control plane shares this network (direct preview reach) — workspaces must NOT be
# able to call its API from inside (unauthenticated endpoints exist: /health, signup).
iptables -I DOCKER-USER 3 -s "$SUBNET" -p tcp --dport 3001 -j REJECT -m comment --comment "$COMMENT"
# DNS (the embedded docker DNS lives on the bridge; UDP+TCP 53 anywhere is fine).
iptables -I DOCKER-USER 4 -s "$SUBNET" -p udp --dport 53 -j RETURN -m comment --comment "$COMMENT"
iptables -I DOCKER-USER 5 -s "$SUBNET" -p tcp --dport 53 -j RETURN -m comment --comment "$COMMENT"
# Workspaces may talk to each other's app ports on the same subnet.
iptables -I DOCKER-USER 6 -s "$SUBNET" -d "$SUBNET" -j RETURN -m comment --comment "$COMMENT"
# Block cloud metadata + link-local.
iptables -I DOCKER-USER 7 -s "$SUBNET" -d 169.254.0.0/16 -j REJECT -m comment --comment "$COMMENT"
# Block private-range pivots (the control plane reaches workspaces, not the reverse).
iptables -I DOCKER-USER 8 -s "$SUBNET" -d 10.0.0.0/8     -j REJECT -m comment --comment "$COMMENT"
iptables -I DOCKER-USER 9 -s "$SUBNET" -d 172.16.0.0/12  -j REJECT -m comment --comment "$COMMENT"
iptables -I DOCKER-USER 10 -s "$SUBNET" -d 192.168.0.0/16 -j REJECT -m comment --comment "$COMMENT"

echo "installed. verify from inside a workspace container:"
echo "  curl -m 3 http://169.254.169.254/   -> must FAIL"
echo "  curl -m 5 https://registry.npmjs.org/ -> must SUCCEED"
