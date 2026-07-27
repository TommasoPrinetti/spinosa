# Spinosa runtime

This package owns deterministic research-run state and durable run records.

- Do not import @opencode-ai packages or UI code.
- Keep all transition functions pure.
- Persist only through the repository interface.
- Cover every transition and terminal state with Bun tests.
