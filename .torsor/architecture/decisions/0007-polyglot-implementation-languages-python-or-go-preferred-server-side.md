---
type: decision
status: accepted
tags:
- adr
links: []
created: '2026-07-15T03:30:25'
updated: '2026-07-15T03:30:25'
rules: []
---

# ADR 0007: Polyglot implementation languages; Python or Go preferred server-side

## Context
The repo currently spans TypeScript (frontend + apps/api + apps/worker) and Go (apps/control-plane). New capabilities (plugins, tooling, services) sometimes fit a language other than the incumbent one, and contributors should not be blocked from picking the right tool. Marko explicitly asked for a standing rule permitting any programming language when needed.

## Decision
Any programming language may be used when it is the right tool for the job. For server-side services and instructions/tooling, prefer Python or Go (Go remains the language of the control plane and its plugins; Python is acceptable for server-side scripts, tooling, and services where it fits better). The frontend stays TypeScript/React. This does not weaken existing invariants: the Go control plane stays a 1:1 port of apps/api until the deliberate cutover, and all backends honor the ownership/session/parameterized-SQL rules regardless of language.

## Consequences
Contributors can introduce Python (or another language) for server-side tooling without an ADR per instance. Polyglot services must still ship with build/run instructions and respect the shared Postgres schema + migration discipline when they touch the DB.
