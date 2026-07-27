# Spinosa core

This package owns workspace, corpus, import, artifact, and application-domain code.

- Do not import from the TUI package or from @opencode-ai packages.
- Keep filesystem writes atomic and workspace-compatible.
- Add focused Bun tests for every behavior change.
- Put research state transitions in @spinosa/runtime, not here.
