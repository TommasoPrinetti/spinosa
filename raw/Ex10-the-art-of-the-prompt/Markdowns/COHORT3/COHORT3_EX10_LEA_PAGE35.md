---
type: "raw_copy"
source: "raw/Ex10-the-art-of-the-prompt/Markdowns/COHORT3/COHORT3_EX10_LEA_PAGE35.md"
source_type: "worksheet_markdown"
text_type: "md"
language: "en"
date: "2025-06"
people: ["Lea"]
organizations: ["Artificial Inquiries"]
topics: ["the art of the prompt", "worksheet page", "cohort 3", "prompting and instruction design", "tasks, conversations, and comparative practice"]
keywords: ["lea", "llm", "claude", "prompt", "task", "ex10b", "learning", "your", "craft"]
concepts: ["[[LLM Representation and Relationships]]", "[[Prompting and Instruction Design]]", "[[Tasks, Conversations, and Comparative Practice]]"]
explicit_source_terms: ["llm", "claude", "prompt", "task"]
inferred_concepts: ["llm representation and relationships", "prompting and instruction design", "tasks, conversations, and comparative practice"]
canonical_aliases: ["Léa"]
metadata_uncertainty: ["date_inferred_from_footer", "date_month_precision"]
related_sources: ["Ex10-the-art-of-the-prompt/Markdowns/COHORT3/COHORT3_EX10_LEA_PAGE33.md", "Ex10-the-art-of-the-prompt/Markdowns/COHORT3/COHORT3_EX10_LEA_PAGE34.md"]
generated_by: "startup_agent"
generated_at: "2026-06-03"
processing_status: "copied_text_headered"
created: "2026-06-03"
updated: "2026-06-03"
cohort: "COHORT3"
student: "LEA"
page: "35"
parent_exercise: "Ex10"
scan_exercise: "Ex10b"
title: "Learning Your Craft"
---

# Ex10b - Learning Your Craft

* see [Additional Notes] & "A systematic survey of Prompt Engineering in LLM: Techniques & Apps"

## Keep Track of Tips and Tricks

### Prompting Techniques:

1.  **Zero-Shot prompting:** You are directly prompting the model through a question without any examples or demonstrations about the task
2.  **Few-Shot prompting:** enable in-context learning where we provide demonstrations in the prompt to steer the model to better performance

**LIMITATIONS**

3.  **Chain-of-thought prompting:** enables complex reasoning through intermediate reasoning steps.
    *   emergent -> w/ sufficiently large LLM
    *   **Zero-shot CoT** => add "let's think step by step" to the original prompt.
    *   **automatic CoT** => 2 main steps
        1.  question clustering
        2.  demonstration sampling

> **Tutorials**

**Meta Prompting:** focus on structural & syntactical aspects of tasks & pb rather than specific content details
*   -> structure-oriented
*   -> syntax focused
*   -> abstract examples
*   -> versatile
*   -> categorical approach

*   (A) Use commands to instruct model ("write", "classify"...) +
*   (B) Use clear separator like "###" to separate the instruction and context.
*   (C) beware of unnecessary details
*   (D) be specific & direct
*   (E) say "what to do" and refrain from listing "what not to do".

> **Tips**

4.  **Tree of Thoughts (ToT)** = generalise over chain of thought prompting and encourage exploration over thoughts & intermediate steps.

> **Risks**
> *   Adversarial prompting
> *   injection, leaking, jailbreaking
> *   hallucination effect

---

## What to do 101:

*   - refine further & condense
*   - turn information into organised plan

> **A prompt contains:**
> *   -> instructions (A)
> *   -> context (B)
> *   -> input data (C)
> *   -> output indicator (D)

*   - experimentation and iteration to optimise.

**Temperature**

> **Tricks**
> *   A) provide ground truth part of context (wikipedia entry).
> *   B) configure to produce less diverse responses (eg "I dk")
> *   **Advantages** = token efficiency + fair comparison of zero-shot efficacy.
> *   C) provide in prompt a combination of examples of Q&A + R that it might know about or not know about
> *   -> probability parameters

### Key Words & Terminology

*   -> iteration steps
*   -> helps with hallucinations!
*   -> "chain-of-density prompting"
*   -> create "in-context" reasoning

**Claude 3 Sonnet (Benchmark)**
*   -> Graduate Level Reasoning 40,4% (0-shot CoT)
*   VS -> Common Knowledge 89% (10 shot)

**INDICATIVE CAPACITIES** ✓

> **5. ReAct: Reason + Act**
> *   Good for decision-making tasks
> *   -> generate both reasoning traces and task-specific actions in an interleaved manner.
> *   = reduces flexibility
> *   = diff reasoning formulation

---

ARTIFICIAL INQUIRIES / JUNE 2025 / PROMPTING • EX10B PAGE 86
