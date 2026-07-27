# Spinosa harness

This package is the only boundary between Spinosa runtime code and the Spinosa kernel.

- Keep the public contract neutral; do not export kernel transport types.
- Kernel-specific mappings belong only in kernel.ts.
- The mock adapter must satisfy the same contract tests.
