---
type: charter
status: active
tags: [charter]
---

# Project Charter

## What we are building
Torsor — an open-source, self-hostable, modular "vibe-coding" cloud IDE. Install one
small server and an entire AI-assisted development environment (edit, run, preview,
test, deploy) runs in cloud infrastructure the user controls. Free out of the box with
local models; hosted models are opt-in (BYO-key).

## Why it exists
AI coding platforms are mostly closed, hosted, and locked to one vendor's models and
infrastructure. Torsor is the open, self-hostable alternative: a small stable kernel
plus a plugin ecosystem (runtimes, model providers, deploy targets, themes) where
first-party features are built on the same public contracts third parties use.

## Non-negotiable principles
- **Free and open by default.** Works with local models (Ollama) — no API key or paid
  service required. Hosted models (Claude/OpenAI/Gemini) are opt-in, never required.
- **Kernel + contributions.** Keep the core small and stable. Every feature is a plugin
  on a versioned public contract — modular in fact, not just on paper.
- **Per-user ownership on every data route.** Project/file/task queries always scope by
  `user_id` and 404 on a miss. Never weaken this. All SQL is parameterized.
- **Sessions are validated, not just signed.** Auth checks the `sessions` row (exists +
  unexpired) so logout/revocation is real. Never fall back to stateless-only JWT checks.
- **Theming is a token pack, not a fork.** UI stays on CSS-variable design tokens so
  white-labeling is drop-in and requires no component changes.
- **Respect the `[now]` / `[partial]` / `[target]` doc tags.** Much of the architecture
  is aspirational. Don't treat target design as built, or present mock UI as real.
- **The Go control plane is a reversible parallel port.** Keep it 1:1 with `apps/api`
  (routes, JSON shapes, schema) until a deliberate cutover — don't let them diverge.
