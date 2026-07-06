export type RouteClass = "fast_path" | "Q1" | "Q2" | "Q3" | "Q4" | "Q5"

const FAST_PATH = [
  /^how do i\b/i,
  /^what is the\b/i,
  /^where is\b/i,
  /^show me\b/i,
  /command palette/i,
  /settings pane/i,
]

const Q5 = [/coverage/i, /\bgaps?\b/i, /overseer/i, /what are we missing/i]
const Q4 = [/cleanup/i, /hygiene/i, /\bstale\b/i, /archive/i, /janitor/i]
const Q3 = [/hidden/i, /subtle/i, /implicit/i, /serendip/i, /cross-cutting/i, /unexpected connections/i]
const Q2 = [/compare/i, /cohort/i, /taxonomy/i, /patterns?\b/i, /across\b/i]
const Q1 = [/evidence/i, /corpus say/i, /find source/i, /lookup/i, /quote/i]

export function classifyPrompt(prompt: string): RouteClass {
  const trimmed = prompt.trim()
  if (!trimmed) return "fast_path"
  if (FAST_PATH.some((pattern) => pattern.test(trimmed))) return "fast_path"
  if (Q5.some((pattern) => pattern.test(trimmed))) return "Q5"
  if (Q4.some((pattern) => pattern.test(trimmed))) return "Q4"
  if (Q3.some((pattern) => pattern.test(trimmed))) return "Q3"
  if (Q2.some((pattern) => pattern.test(trimmed))) return "Q2"
  if (Q1.some((pattern) => pattern.test(trimmed))) return "Q1"
  return "Q2"
}

export function isNonFastPath(route: RouteClass) {
  return route !== "fast_path"
}

export function chainForRoute(route: RouteClass) {
  switch (route) {
    case "Q1":
      return "searcher → writer → verifier → evaluator"
    case "Q2":
      return "searcher → analyst → writer → verifier → evaluator"
    case "Q3":
      return "searcher → analyst → serendippo → writer → verifier → evaluator"
    case "Q4":
      return "janitor → verifier → evaluator"
    case "Q5":
      return "overseer → evaluator"
    default:
      return "direct"
  }
}
