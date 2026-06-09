---
type: protocol_spec
role: batch_converter_protocol
scope: [all converter engines]
description: Formal wire format for Pilosa converter batch protocol.
version: 1
connects_to:
  - rapidocr-cli.py
  - markitdown-cli.py
created: 2026-06-09
updated: 2026-06-09
---

# Pilosa Converter Protocol v1

Formal specification for the batch converter protocol. Every converter engine CLI
wrapper (`rapidocr-cli`, `markitdown-cli`, and future engines) implements this protocol.
The orchestrator (`.bin/pilosa`) parses events from all converters uniformly.

## stdin (tab-separated lines)

```
SOURCE\t<path/to/source/root>
FILE\t<path/to/src>\t<path/to/dest.md>
```

- `SOURCE` — sent once at the start of each batch. Provides the root directory prefix
  for computing relative paths in stderr events.
- `FILE` — sent once per file to convert. `src` is the absolute path to the source file.
  `dest` is the absolute path where the output `.md` file should be written.

## stderr (tab-separated lines)

```
BEGIN\t<rel_path>
PROGRESS\t<unit>/<total>          # OPTIONAL — omit if converter is not page-oriented
END\tok|fail\t<rel_path>\t<duration_seconds>
```

- `BEGIN` — emitted when conversion of a file starts. `rel_path` is the path relative
  to the source root (derived from the `SOURCE` prefix).
- `PROGRESS` — **optional.** Emitted during conversion to signal incremental progress.
  For page-oriented converters (PDF OCR), `unit` is the current page number and `total`
  is the total number of pages. Non-page-oriented converters (docx, xlsx, epub) MUST
  NOT emit PROGRESS events. The orchestrator handles missing PROGRESS gracefully.
- `END` — emitted when conversion completes. Status is `ok` or `fail`. `rel_path`
  matches the BEGIN event. `duration_seconds` is an integer of elapsed wall-clock
  seconds.

## Contract

1. **Ordering**: Events are serialized per file — BEGIN, optional PROGRESS*, END — in
   that order. The FIFO reader in the orchestrator processes them sequentially.
2. **No interleaving**: All events for file A complete before any event for file B.
3. **stderr only**: All event lines go to stderr. stdout must not emit anything.
4. **Tab as delimiter**: All fields are tab-separated. No escaping — field values
   must not contain tabs.
5. **Exit code**: The converter process exits 0 on overall success. Individual file
   failures are reported via `END fail`, not via exit code.
6. **PROGRESS omission**: If a converter emits BEGIN → END with no PROGRESS lines,
   the orchestrator displays progress without per-unit page information. Converters
   that know they never emit PROGRESS should signal this by emitting a single
   `PROGRESS 0/0` immediately after BEGIN, or simply omit PROGRESS entirely.
