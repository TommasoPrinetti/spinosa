# Contributing

## Branches

- `main` — stable, tagged releases
- `dev` — active development

Base all PRs against `dev`.

## Development

```bash
git clone https://github.com/TommasoPrinetti/spinosa.git
cd spinosa
bash tests/test_cli.sh
```

## Tests

| Suite | Command |
|---|---|
| CLI unit tests | `bash tests/test_cli.sh` |
| Interactive tests | `bash tests/test_interactive.sh` |
| Smoke/integration | `bash tests/smoke.sh` |

## Pull requests

- Keep changes focused. One feature or fix per PR.
- Update or add tests for any logic changes.
- Run all test suites before submitting.
- Update `CHANGELOG.md` with a summary of the change.

## Code style

- Shell scripts: POSIX-compatible, target bash 3.2+.
- Prefer `if/elif` over `case` statements for config parsing.
- Use `.bin/lib/metrics.sh` for consistent logging.
- Python wrappers go in `.bin/lib/`.

## Documentation

- The root `AGENTS.md` is the orchestrator playbook. Changes to the sub-agent pipeline or dispatch logic must be reflected there.
- Directory-level `AGENTS.md` files document ownership and rules for each subdirectory.
- `README.md` is the user-facing quick start. Keep it concise.

## License

By contributing, you agree that your contributions will be licensed under the [PolyForm Noncommercial 1.0.0](LICENSE).
