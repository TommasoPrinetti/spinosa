# Spinosa harness

This package is the only boundary between Spinosa runtime code and the Spinosa kernel.

- Keep the public contract neutral; do not export kernel transport types.
- Kernel-specific mappings belong only in kernel.ts.
- The mock adapter must satisfy the same contract tests.
- Loop-control semantics (steer/queue admission, cancel) are covered additively in `test/loop-control.test.ts` with the faux mock provider — do not dump the full session runner here.
