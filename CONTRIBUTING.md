# Contributing

Thanks for helping improve Spinosa. This repository is kept deliberately small and maintainable, so contributions should stay focused and easy to review.

## Bug reports

Open a GitHub issue with:

- what you were trying to do
- what happened instead
- the exact command, file, or page involved
- the version, platform, and any relevant logs or screenshots

If the issue touches a specific command or workflow, include the narrowest reproduction you can.

## Feature requests

Open a GitHub issue and describe:

- the problem you are trying to solve
- the behavior you want
- any alternatives you considered
- whether the change is user-facing, developer-facing, or internal

Small, concrete requests are easier to evaluate and ship than broad redesigns.

## Pull request flow

1. Open an issue first for larger changes so the scope is clear.
2. Keep the pull request focused on one concern.
3. Rebase or merge against the current default branch before asking for review.
4. Include a short summary of the change and the validation you ran.
5. Link the related issue when there is one.

## Coding standards

- Match the existing repository style and naming.
- Keep edits minimal and avoid unrelated refactors.
- Prefer straightforward code over clever abstractions.
- Do not change install scripts, CLI scripts, or unrelated files unless the task requires it.
- Default to ASCII unless a file already uses a different character set.

## Testing expectations

- Run the narrowest useful validation for the change.
- For behavior changes, include the relevant test or command output in the PR description.
- For docs and templates, verify the files render cleanly and any YAML parses correctly.
- Do not claim a change is complete without some form of validation.
- Before merging release-impacting work, run `bun run quality` or `bun run release:validate`.

## Releases (maintainers)

Framework releases are cut **locally** — not via GitHub Actions. See [RELEASE_GUIDE.md](RELEASE_GUIDE.md) for the full pipeline.

| Task | Command |
|------|---------|
| Pre-release gate | `bun run release:validate` (runs `bun run quality`) |
| Standard beta release | `bun run release:beta:patch` (or `:minor`) |
| Standard stable release | `bun run release:stable:patch` (or `:minor` / `:major`) |
| Republish explicit version | `bun run release:republish -- vX.Y.Z` |
| Sync version files | `bun script/set-version.ts <version>` |
| Regenerate patch audit | `bun run patches:generate` |

Interactive test matrix: `workspace-template/docs/reference/testsuite.md`.

