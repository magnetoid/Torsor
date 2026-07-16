---
type: decision
status: accepted
tags:
- adr
links: []
created: '2026-07-16T23:46:22'
updated: '2026-07-16T23:46:22'
rules: []
---

# ADR 0010: Prefer integrating open-source over building from scratch

## Context
Torsor is free and open by default, and moves fast across a broad surface (agent loop, runtimes, MCP, collab, microVMs). Re-implementing capabilities that mature, well-maintained open-source projects already solve wastes time and adds bespoke code to own forever. The plugin/kernel architecture (ADR 0008) is explicitly designed to absorb external implementations behind narrow contracts.

## Decision
Always evaluate and, by default, integrate/adapt existing open-source code, libraries, tools, and reference implementations to build and improve platform features — rather than writing bespoke equivalents — whenever a suitable one exists. Reach for the open-source option first (e.g. y-websocket/Yjs for collab, firecracker-go-sdk for microVMs, the official MCP SDK, established Go/React libraries) and wrap it behind Torsor's plugin/kernel contracts or thin adapters. Only build in-house when: no fitting project exists; the license is incompatible with free/open redistribution; it fails a security/maintenance review; it would add disproportionate bloat; or a trivial local implementation is genuinely simpler. When integrating, record the source + license.

## Consequences
Faster development and less bespoke code to maintain; the platform rides battle-tested implementations. Requires vetting each dependency for license compatibility (must keep the stack free/open-redistributable), security posture, and maintenance health, and keeping integrations behind swappable contracts so a dependency can be replaced. Contributors must justify NOT reusing an obvious open-source option.
