---
type: decision
status: accepted
tags:
- adr
links: []
created: '2026-07-16T01:13:31'
updated: '2026-07-16T01:13:31'
rules:
- kind: forbid_pattern
  target: exec\.Command\("docker"
  scope: apps/control-plane/internal/**/*.go
  severity: warning
  message: "Container execution belongs in the WorkspaceRuntime plugin (cmd/docker-runtime),\
    \ never in the control-plane core \u2014 keeps runtimes swappable (docker today,\
    \ Firecracker/K8s later)."
- kind: forbid_pattern
  target: anthropic-sdk-go|sashabaranov/go-openai|google/generative-ai-go
  scope: apps/control-plane/internal/**/*.go
  severity: warning
  message: "Hosted-model SDKs live only in ModelProvider plugin binaries (cmd/*-model),\
    \ never in the control-plane core \u2014 providers stay opt-in and swappable."
- kind: forbid_pattern
  target: from '\.\./tabs/
  scope: src/components/shell/*.tsx
  severity: warning
  message: The shell renders tools from the kernel ContributionRegistry (src/kernel/contributions.ts);
    importing tab components directly hard-wires the UI and breaks pluggability.
---

# ADR 0008: Whole platform is fully modular and plugin-based

## Context
Torsor's differentiation is the kernel + contributions architecture: a small stable core with every capability delivered as a plugin on a versioned public contract. This is now proven in practice — backend capabilities (ModelProvider, WorkspaceRuntime) run out-of-process over gRPC via hashicorp/go-plugin (mock-model, ollama-model, anthropic-model, mock-runtime, docker-runtime all ship as separate binaries), and frontend tabs resolve through the ContributionRegistry rather than direct imports. The runtime plugin contract is also the virtualization strategy: swapping container execution (docker-runtime today) for Firecracker microVMs or K8s later is a new plugin binary, zero core changes. The risk as the platform grows is convenience shortcuts: calling the docker CLI from the control-plane core, bundling a hosted-model SDK into the core or frontend, or hard-wiring a UI tool into the shell — each one quietly turns the plugin story back into a monolith.

## Decision
The whole platform must be fully modular and plugin-based. Concretely: (1) Backend capabilities (model providers, workspace runtimes, and future DeployTarget/VCSProvider/etc.) live in separate plugin executables behind the gRPC capability contracts in internal/plugin — the control-plane core never embeds a provider SDK and never shells out to docker/podman/firecracker itself. (2) New execution backends (Firecracker, K8s) are delivered as new WorkspaceRuntime plugins selected via TORSOR_WORKSPACE_RUNTIME_PLUGINS, not as core rewrites. (3) Frontend tools/tabs register through the kernel ContributionRegistry (src/kernel/contributions.ts); the shell renders from the registry and never imports tab components directly. (4) Theming stays a token pack (per ADR 0003). (5) Any feature that cannot be expressed through an existing contract is a signal to design a new versioned capability contract, not to special-case the core.

## Consequences
The core stays small, auditable, and stable while capabilities multiply; a crashing plugin cannot take down the control plane; runtimes/models are swappable per deployment (free local Ollama by default, hosted opt-in; docker today, microVMs later) — at the cost of gRPC contract maintenance and slightly more boilerplate per capability. Drift guard now flags: docker CLI usage outside cmd/docker-runtime, hosted-model SDK imports inside the control-plane core, and shell components importing tab components directly instead of via the contribution registry.
