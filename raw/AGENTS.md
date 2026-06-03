---
type: directory_guidance
scope: [raw corpus access rules]
connects_to:
  - AGENTS.md
  - HEADER_TEMPLATE.md
  - maps/MAP_TEMPLATE.md
created: 2026-06-03
updated: 2026-06-03
---

# raw/ Rules

`raw/` is the active working corpus after onboarding. On the framework branch it should contain only this guidance file and `.gitkeep`.

## Boundaries

- Raw copies are read-only during normal research operations.
- Onboarding may copy markdown-convertible files, native-readable files, and PDFs into this directory.
- Images, video, and audio stay in the Root Vault; do not create new media pointer records.
- Legacy `.pointer.md` files may exist on old project branches, but new framework startup should skip them.

## Headers

- Raw copy headers follow `HEADER_TEMPLATE.md`.
- `source:` uses a repo-relative `raw/...` path, not an absolute Root Vault path.
- Root Vault path stays in `INFORMATIONS.md` for re-onboarding.

## Routing

Source-grounded questions should be handled by the orchestrator through Searcher, Writer, and Verifier. Standard coding agents should not answer directly from `raw/`.
