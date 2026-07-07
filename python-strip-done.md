# Python Vendor Removal Complete

## Files Modified

### `packages/spinosa-core/src/tools/detection.ts`
- Removed: `isExecutable()`, `unifiedVendorDir()`, `frameworkVendorDir()`
- Removed: `vendorPythonForTool()` — vendored Python binary lookup
- Removed: `bundledPythonBin()` — bundled Python path discovery
- Removed: `fallbackPythonBin()` — system Python fallback
- Removed: `markitdownScriptPath()` — Python markitdown-cli.py script path
- Removed: `structuredFallbackAvailable()` — dead Python fallback check
- Removed: `markitdownToolAvailable()` — only used by removed `markitdownAvailable()`
- Removed: `markitdownAvailable()` — always returns `true` via markitdown-ts
- Removed: `markitdownBin()` — Python vendor binary path
- Simplified: `pypdfAvailable()` — removed Python pypdf import check, now only checks pdftotext+pdfinfo
- Simplified: `configureSelectedImportTools()` — removed MarkItDown unavailability warnings (markitdown-ts always available)
- Cleaned up: unused imports (`existsSync`, `accessSync`, `constants`, `homedir`, `path`, `spawnSync`, `createRequire`, `resolveFrameworkRoot`)

### `packages/spinosa-core/src/commands/add.ts`
- Replaced `runBatchMarkitdown()` (Python CLI-based batch conversion) with async version using `markitdown-ts` (`MarkItDown`)
- Replaced single-file markitdown case in `addSingleFile()` with `markitdown-ts`
- Removed: imports of `markitdownBin`, `fallbackPythonBin`, `markitdownScriptPath`, `structuredFallbackAvailable`
- Removed: unused `spawnSync` import
- Added: `writeFileSync`, `readdirSync` imports; `MarkItDown` import

### `packages/spinosa-core/src/import/pipeline.ts`
- Removed: `resolveBinary("markitdown-cli")` code path in `runMarkitdownPhase()` — now exclusively uses `new MarkItDown()` from `markitdown-ts`
- Removed: `retryConverterMarkitdown()` function (Python CLI recovery)
- Removed: `resolveBinary()` function
- Removed: `runConverterBatch()`, `BatchFileEntry`, `ConverterResult` — dead code
- Removed: `markitdownBin` import from detection
- Removed: unused `spawn` and `createInterface` imports
- Updated: verify & recover markitdown case to use `markitdown-ts` instead of `retryConverterMarkitdown`

### `packages/spinosa-core/src/scan/scanner.ts`
- Removed: `markitdownAvailable()` import
- Updated: `detectDocumentTools()` returns `markitdown: true` (always available via markitdown-ts)

### `install.sh`
- Removed: VENDOR_PIP_MARKITDOWN, VENDOR_PIP_PYPDF, VENDOR_PIP_PYPDFIUM2, VENDOR_PIP_RAPIDOCR variables
- Removed: `vendor_pip_fingerprint()`, `vendor_python_for_dir()`, `vendor_tarball_sha_from_checksums()`
- Removed: `vendor_packages_healthy()`, `vendor_installed_pins_match()`, `vendor_binaries_healthy()`
- Removed: `vendor_bundle_can_reuse()`, `vendor_tool_checks_pass()`
- Removed: `verify_vendor_binaries()`, `smoke_check_vendor_tools()`
- Removed: `read_vendor_metadata_field()`, `write_vendor_metadata()`
- Removed: `install_vendor_python_packages()` function (full pip section)
- Simplified: `install_vendor_bundles()` — now a no-op (vendor tarball only contained Python)
- Removed: vendor bundles call from main()
- Removed: `verify_vendor_binaries` call from `handle_verify_only()`

### `packages/tui/src/spinosa/onboarding-preview.ts`
- No changes needed — delegates to core scanner which has been cleaned up

## Verification
- TypeScript compiles cleanly (`tsc --noEmit` produces no errors)
- No remaining references to removed functions anywhere in the codebase
