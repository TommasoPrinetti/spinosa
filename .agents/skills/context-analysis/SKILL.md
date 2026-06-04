---
name: context-analysis
type: skill
scope: contextual_analysis
description: Provide broader contextual analysis parallel to Searcher
created: 2026-05-26
updated: 2026-06-04
---

## Purpose

Run in parallel to Searcher. Use project context and dictionary to generate broader perspective on the question — what's missing, what alternative framings exist, what biases a search-only approach might introduce.

## Prerequisites

- Searcher is searching raw corpus for evidence (runs in parallel)
- `system/context.md` exists with project scope and research vocabulary
- `system/dictionary.md` exists with canonical terms and concepts

## Steps

1. Read `system/context.md` to understand project scope, methods, and research vocabulary.
2. Read `system/dictionary.md` to understand canonical terms, concepts, and relationships.
3. Analyze the user's question against the project context:
   - What does the corpus suggest about this topic beyond the literal query?
   - What angles are potentially missing from a targeted search?
   - What alternative framings of the question exist?
   - What biases might a search-only approach introduce?
4. Return an analysis packet using the template from `references/analysis-template.md`.
5. Use the analytical questions in `references/analysis-questions.md` as a checklist.

## Rules

- Never invent evidence. You work from context and dictionary, not from raw/ sources.
- Clearly label observations as contextual, not factual.
- Flag where your analysis needs raw corpus validation.
- Do not duplicate Searcher's job — you provide breadth, not depth.
- Keep analysis concise and structured. No filler.

## See also

- `report-writing` — Writer synthesizes your analysis with Searcher's evidence
- `orchestrator-dispatch` — Analyst runs in parallel to Searcher
