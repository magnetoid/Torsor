---
type: decision
status: accepted
tags: [adr, frontend]
links: []
rules:
  - kind: forbid_pattern
    target: '@google/genai'
    scope: 'src/**/*.tsx'
    severity: warning
    message: 'Phase 0 removed @google/genai. Frontend model access goes through the backend ModelProvider, not a bundled SDK.'
  - kind: forbid_pattern
    target: '@google/genai'
    scope: 'src/**/*.ts'
    severity: warning
    message: 'Phase 0 removed @google/genai. Frontend model access goes through the backend ModelProvider, not a bundled SDK.'
  - kind: forbid_pattern
    target: '#[0-9a-fA-F]{6}\b'
    scope: 'src/components/**/*.tsx'
    severity: hint
    message: 'Use CSS-variable design tokens (bg-page, text-secondary, border-default, …), not raw hex — keeps theming/white-label drop-in.'
---

# ADR 0003: Theming via design tokens; no bundled model SDK in the frontend

## Context
Two charter principles: theming is a token pack (not a fork), and models are accessed
through the backend `ModelProvider` (local-first, BYO-key) — not a vendor SDK shipped in
the browser bundle. Phase 0 explicitly removed the unused `@google/genai` dependency.

## Decision
- Frontend UI uses CSS-variable design tokens; no raw hex colors in components.
- The frontend never imports a model-vendor SDK (e.g. `@google/genai`); it calls the
  backend, which owns provider plugins.

## Consequences
White-labeling stays drop-in (no component edits), and provider choice stays a backend
concern behind one stable contract. Hex is a `hint` (icons/charts may need exceptions);
the SDK ban is a `warning`.
