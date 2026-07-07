# Spinosa TUI — Plan

## Goal
Ship our enhanced opencode fork as `spinosa-tui`, installable via `bun install -g @spinosa/tui`.
The `spinosa` CLI installer runs `bun install -g @spinosa/tui` to get the TUI binary.

## Steps

### 1. Create spinosa-tui/ package
A workspace package in the monorepo that:
- Depends on our fork of opencode + tui + spinosa-core (workspace deps)
- Has its own `src/index.ts` entry that starts the TUI
- Has `build.ts` that compiles to platform binaries (same approach as opencode's build)
- Published to npm as `@spinosa/tui-{platform}-{arch}` (prebuilt binaries) + `@spinosa/tui` (launcher)

### 2. Modify .bin/spinosa
The installed `spinosa` CLI runs `bun install -g @spinosa/tui` if the TUI isn't installed,
then launches `npx spinosa-tui` to start the TUI.

### 3. Modify install.sh
After framework extraction, run `$bun_bin install -g @spinosa/tui` to download the prebuilt TUI binary.
This replaces the current "run system opencode from PATH" behavior.

### 4. Publish pipeline
- `script/build-tui.ts` compiles our fork into platform binaries
- Publishes them as `@spinosa/tui-{platform}-{arch}@<version>`
- Publishes `@spinosa/tui@<version>` (the launcher package)
