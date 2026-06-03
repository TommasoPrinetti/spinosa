---
type: "raw_copy"
source: "raw/Ex10-the-art-of-the-prompt/Markdowns/COHORT1/COHORT1_EX10_LEA_PAGE37(2).md"
source_type: "worksheet_markdown"
text_type: "md"
language: "en"
date: "2024-11"
people: ["Lea"]
organizations: ["Artificial Inquiries"]
topics: ["the art of the prompt", "worksheet page", "cohort 1", "prompting and instruction design", "tasks, conversations, and comparative practice"]
keywords: ["lea", "prompt", "task", "conversation", "ex10", "self", "refine"]
concepts: ["[[Prompting and Instruction Design]]", "[[Tasks, Conversations, and Comparative Practice]]"]
explicit_source_terms: ["prompt", "task", "conversation"]
inferred_concepts: ["prompting and instruction design", "tasks, conversations, and comparative practice"]
canonical_aliases: ["Léa"]
machine_artifacts: ["duplicate_page_suffix"]
metadata_uncertainty: ["date_inferred_from_footer", "date_month_precision"]
related_sources: ["Ex10-the-art-of-the-prompt/Markdowns/COHORT1/COHORT1_EX10_LEA_PAGE35(2).md"]
generated_by: "startup_agent"
generated_at: "2026-06-03"
processing_status: "copied_text_headered"
created: "2026-06-03"
updated: "2026-06-03"
cohort: "COHORT1"
student: "LEA"
page: "37"
parent_exercise: "Ex10"
scan_exercise: "Ex10"
title: "Self-Refine"
---

# Ex10 - Self-Refine

**Why is this prompting technique supposed to work?**
The authors don't really elaborate on why this is supposed to work. But the conversational metaphor still holds: a longer, deeper conversation with an interlocutor that provides feedback to your answers and prompts you to elaborate will usually lead to better/deeper understanding etc.

**When you first read the paper, what did you think about the technique?**
I thought it was a bit overkill to call a basic conversational practice a "prompting technique". The algorithmic version of this technique can be interesting when using models to perform e.g. classification tasks, but the feedback can hardly be domain-agnostic and the authors don't really state whether using generic feedback usually lead to better response. What's more, the paper is very fuzzy about what they call a "stop condition"

---

**For whom is this technique supposed to perform well?**
Anyone. This technique can supposedly be used in any scenario. However, the feedback you must provide to the model in order to make it self-refine must be domain-dependent of course.

One could also argue this technique only works with domain experts because you need to be able to tell the model what is wrong or need to be improved in the initial results you get, to be able to provide useful feedback for the model so it can provide a better response later on.

**Do you think this technique made a difference?**
Yes this technique made a difference in my prompting, but I was already using it and I think a lot of people already intuitively already do it without calling this a "technique".

---

**Date:**
2023/04/25

**Doi - Link:**
https://arxiv.org/abs/2303.17651v2

**Author:**
Aman Madaan, Niket Tandon, Prakhhar Gupta, Skyler Hallinan, Luyu Gao, Sarah Wiegreffe, Uri Alon, Nouha Dziri, Shrimai Prabhumoye, Yiming Yang, Shashank Gupta, Bodhisattwa Prasad Majumder, Katherine Hermann, Sean Welleck, Amir Yazdanbakhsh, Peter Clark; Language Technologies Institute, Carnegie Mellon University; Allen Institute for Artificial Intelligence; University of Washington; NVIDIA; UC San Diego; Google Research, Brain Team

ARTIFICIAL INQUIRIES / NOVEMBER 2024 / EX10