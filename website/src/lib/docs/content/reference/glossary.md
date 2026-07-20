# Glossary

Plain-English definitions of the terms you see most often. This page stays short on purpose. For full explanations, follow the linked canonical pages.

## Core terms

| Term             | Meaning                                                                                                                                              |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Corpus**       | Your source collection: PDFs, transcripts, notes, images, and related research files. See [Corpus Structure](/docs/corpus).                          |
| **Workspace**    | The local folder Spinosa creates from your corpus, including `raw/`, `maps/`, `system/`, and `agent_reports/`. See [Corpus Structure](/docs/corpus). |
| **Orchestrator** | The top-level coordinator that decides which agents should run for a request. See [Agents & Pipeline](/docs/agents).                                 |
| **Pipeline**     | The sequence of agent steps used to answer a given request. See [Agents & Pipeline](/docs/agents).                                                   |
| **Sub-agent**    | A specialized helper such as Searcher, Analyst, Writer, or Verifier. See [Agents & Pipeline](/docs/agents).                                          |

## Workspace terms

| Term              | Meaning                                                                                                                     |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **raw/**          | Converted local copies of your source documents. This is the evidence layer agents search and cite.                         |
| **maps/**         | Navigation maps that help agents find clusters of relevant files and themes.                                                |
| **system/**       | Settings and index files such as `configuration.md`, `context.md`, `dictionary.md`, and `workspace_index.md`.               |
| **Dictionary**    | The vocabulary list Spinosa builds from the corpus: names, places, organizations, concepts, aliases, and uncertain terms.   |
| **YAML header**   | The metadata block at the top of a `raw/` file describing source type, language, dates, people, topics, and related fields. |
| **Source intake** | The workflow for adding new material to an existing workspace without rebuilding everything from scratch.                   |

## Report terms

| Term                    | Meaning                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **agent_reports/**      | The folder where startup reports, answers, and other report artifacts are written.                                        |
| **Evidence packet**     | An intermediate file that packages candidate quotes and source paths for report drafting.                                 |
| **Confidence level**    | A signal of how directly a passage supports a point: typically high, medium, or low.                                      |
| **Verification status** | The report outcome after source checking: pending, verified, corrected, or failed. See [Reports & Charts](/docs/reports). |

## Conversion terms

| Term                   | Meaning                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| **OCR**                | Optical Character Recognition: turning scanned or image-based text into searchable text.               |
| **MarkItDown**         | The converter used for many office, EPUB, HTML, and text-based PDF formats.                            |
| **RapidOCR**           | The local OCR engine used for scanned PDFs and image-heavy files.                                      |
| **Obsidian wikilinks** | Double-bracket links like `[[filename]]` used in navigation maps for graph-style browsing in Obsidian. |

## Next reads

- [Corpus Structure](/docs/corpus) for workspace layout and file roles
- [Agents & Pipeline](/docs/agents) for agent names and responsibilities
- [Reports & Charts](/docs/reports) for report anatomy and statuses
- [FAQ](/docs/faq) if you came here because something is confusing or broken
