# Changelog

## v0.5.1 (current)

- Rename `pilosa` to `spinosa` with auto-upgrade from old name
- `pilosa` alias shim — both commands work during transition
- Plain language audit — replace jargon in user-facing text
- Add ASCII art banner to installer
- Vendor repair and `--reinstall` flag for `upgrade`
- macOS xattr compatibility fix for Linux extraction

## v0.5.0

- Feat: scan home directory for workspaces with privacy disclaimer
- 11 security and resilience fixes
- Cross-platform fixes: `x86_64`→`amd64` mapping, macOS metadata filtering
- Switch from bundled pip packages to `pip`-at-install-time
- Animated progress bar for pip install steps
- Retry vendor download with visible errors, TUI flicker fix
- Terminal width, tab completion, CWD detection, `._`/`__MACOSX`/`.localized` cleanup

## v0.4.7 — v0.4.13

- Vendor tarballs as standalone release assets (no longer embedded in framework archive)
- Cross-platform vendor builds for darwin + linux, amd64 + arm64
- Bash 3.2 compatibility (`=~` regex fix)
- Import-first logic for model ops, visible red error messages
- `COPYFILE_DISABLE` for macOS tar compatibility
- Linux `libGL` detection
- Home directory workspace scanning

## v0.4.0 — v0.4.6

- **MarkItDown integration** — unified vendor bundle with CI/CD
- English-only OCR with progress bars (remove Chinese models)
- Batch OCR with debug logging and UX hardening
- Cross-platform terminal launch in new tab (macOS)
- Variable hygiene: mask-safe locals, word-splitting, dead code removal
- Bash `arrow_select` as default menu (Revert `USE_GUM`)
- Release-engineering skill and mirror sync
- Spinner UX fixes for downloads and vendor extraction
- PDF classifier broken pipe fix
- `NATIVE`→`md-only` routing expansion

## v0.3.0 — v0.3.9

- **Bug fixes and comprehensive test suite** (15 unit tests, 14 interactive tests, 17 smoke tests)
- **RapidOCR vendor bundles** with standalone Python distribution
- Download progress bar replaces spinner for framework download
- Live page progress during OCR, skip OCR prompt, annotate batch picker
- Compact upgrade release notes to 3 lines
- Remove 'Next step' menu, import directly after batch selection
- Illustrated logo replaces ASCII logo
- Copy progress bar shows only copied files (not OCR)

## v0.2.0 — v0.2.9

- **Pilosa CLI** — `new`, `prepare`, `update`, `upgrade`, `check`, `health`, `sync`, `uninstall`
- Interactive dashboard TUI
- Workspace discovery with permission detection and caching
- Global Ctrl-C trap and persistent workspace registry
- Vertical pulse spinner for slow operations
- Release notes before upgrade confirmation
- Obsidian graph connectivity with wikilinks
- Corpus-first flow with auto-generated sibling workspace
- `pilosa check` + `sync` commands, 22 audit issues fixed
- Cross-platform binaries, bash 3.2 compat, PATH fallback
- Checksum verification, version pinning, min-days security for installer
- Unicode dashboard system with report numbering
- Security: hardened `.gitignore` for `.trash/` rules

## v0.1.0

- Initial release
- Onboarding flow with vault import
- Startup protocol for workspace indexing
