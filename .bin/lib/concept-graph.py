#!/usr/bin/env python3
"""
Concept graph builder, query tool, and MCP server for Spinosa.

Commands:
  build       Build concept graph from dictionary + extraction batches
  query TERM  Query related concepts and files for a term
  serve       Start stdio-based MCP server for graph queries
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

import networkx as nx


ROOT = Path(os.environ.get("SPINOSA_HOME", Path.cwd()))
DICT_PATH = ROOT / "system" / "dictionary.md"
GRAPH_PATH = ROOT / "system" / "concept-graph.json"
REPORTS_DIR = ROOT / "agent_reports"

# ── Graph schema ──────────────────────────────────────────────────────────

NODE_CONCEPT = "concept"
NODE_FILE = "file"
NODE_PERSON = "person"
NODE_PLACE = "place"
NODE_ORG = "org"
NODE_TERM = "term"

EDGE_MENTIONS = "mentions"
EDGE_COOCCURS = "co_occurs"
EDGE_RELATES_TO = "relates_to"


# ── Parsers ──────────────────────────────────────────────────────────────

HEADING_TYPE_PATTERNS = (
    (re.compile(r"\b(names?|people|persons?)\b", re.I), NODE_PERSON),
    (re.compile(r"\bplaces?\b", re.I), NODE_PLACE),
    (re.compile(r"\b(organi[sz]ations?|orgs?)\b", re.I), NODE_ORG),
    (re.compile(r"\b(concepts?|inferred concepts?)\b", re.I), NODE_CONCEPT),
    (re.compile(r"\b(explicit|domain|source terms?|terms?)\b", re.I), NODE_TERM),
)

PLACEHOLDER_RE = re.compile(r"^\[?filled by startup\]?$", re.I)


def clean_term(value: str) -> str:
    value = re.sub(r"`([^`]+)`", r"\1", value)
    value = re.sub(r"\[\[([^]|#]+)(?:#[^]|]+)?(?:\|[^]]+)?\]\]", r"\1", value)
    value = value.strip().strip("\"'")
    value = re.sub(r"\s+", " ", value)
    return value


def is_placeholder(value: str) -> bool:
    return not value or bool(PLACEHOLDER_RE.match(value.strip()))


def node_type_for_heading(heading: str) -> str:
    for pattern, node_type in HEADING_TYPE_PATTERNS:
        if pattern.search(heading):
            return node_type
    return NODE_CONCEPT


def split_aliases(raw: str) -> list[str]:
    aliases = []
    for alias in re.split(r"[,;]", raw):
        cleaned = clean_term(alias)
        if cleaned and not is_placeholder(cleaned):
            aliases.append(cleaned)
    return aliases


def extract_inline_terms(raw: str) -> list[str]:
    terms: list[str] = []
    for match in re.findall(r"`([^`]+)`|\[\[([^]|#]+)(?:#[^]|]+)?(?:\|[^]]+)?\]\]", raw):
        cleaned = clean_term(match[0] or match[1])
        if cleaned and not is_placeholder(cleaned):
            terms.append(cleaned)
    if not terms:
        raw = raw.strip().strip("[]")
        for item in re.split(r"[,;]", raw):
            cleaned = clean_term(item)
            if cleaned and not is_placeholder(cleaned) and cleaned.lower() not in {"none", "n/a"}:
                terms.append(cleaned)
    return terms

def parse_markdown_table(text: str) -> list[dict[str, str]]:
    lines = [line for line in text.strip().splitlines() if line.strip()]
    header_index = None
    for idx, line in enumerate(lines[:-1]):
        next_line = lines[idx + 1].strip()
        if line.strip().startswith("|") and re.match(r"^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$", next_line):
            header_index = idx
            break
    if header_index is None:
        return []
    header = [h.strip() for h in lines[header_index].strip("|").split("|")]
    rows: list[dict[str, str]] = []
    for line in lines[header_index + 2:]:
        line = line.strip()
        if not line or not line.startswith("|"):
            break
        cells = [c.strip() for c in line.strip("|").split("|")]
        if len(cells) != len(header):
            continue
        rows.append(dict(zip(header, cells)))
    return rows


def parse_dictionary(path: Path) -> list[dict[str, str]]:
    text = path.read_text(encoding="utf-8")
    sections = re.split(r"^##\s+", text, flags=re.MULTILINE)
    entries: list[dict[str, str]] = []
    for sec in sections:
        if not sec.strip():
            continue
        lines = sec.splitlines()
        heading = lines[0].strip()
        node_type = node_type_for_heading(heading)

        for row in parse_markdown_table(sec):
            canonical = (
                row.get("Canonical form")
                or row.get("Source term")
                or row.get("Term")
                or row.get("Artifact")
                or ""
            )
            canonical = clean_term(canonical)
            if is_placeholder(canonical):
                continue
            row["Canonical form"] = canonical
            row["_node_type"] = node_type
            entries.append(row)

        for line in lines[1:]:
            match = re.match(r"^\s*-\s+\*\*(.+?)\*\*\s*(?:—|--|-|:)\s*(.*)$", line)
            if not match:
                continue
            canonical = clean_term(match.group(1))
            if is_placeholder(canonical):
                continue
            description = match.group(2).strip()
            aliases_match = re.search(r"(?:aliases?|aka|also known as):\s*([^.;]+)", description, re.I)
            entries.append({
                "Canonical form": canonical,
                "Aliases": aliases_match.group(1).strip() if aliases_match else "",
                "Description": description,
                "_node_type": node_type,
            })
    return entries


def parse_extraction_batches(reports_dir: Path = REPORTS_DIR, pattern: str = "extraction_batch_*.md") -> list[dict[str, Any]]:
    files = sorted(reports_dir.glob(pattern))
    results = []
    for fpath in files:
        text = fpath.read_text(encoding="utf-8")
        packets = re.split(r"^###\s+", text, flags=re.MULTILINE)
        for pkt in packets[1:]:
            if not pkt.strip():
                continue
            header = pkt.splitlines()[0].strip().strip("[]")
            source_file = clean_term(header)
            concepts = set()
            conns = set()
            for line in pkt.splitlines():
                cl = line.strip()
                if cl.startswith("- **Path:**"):
                    path_match = re.search(r"\[\[([^]|#]+)", cl)
                    if path_match:
                        source_file = clean_term(path_match.group(1))
                elif cl.startswith("- **Concept signals:**"):
                    raw = cl.split(":", 1)[1].strip()
                    concepts.update(extract_inline_terms(raw))
                elif cl.startswith("- **Connections:**"):
                    raw = cl.split(":", 1)[1].strip()
                    for c in re.findall(r"\[\[([^]|#]+)", raw):
                        cleaned = clean_term(c)
                        if cleaned and not is_placeholder(cleaned):
                            conns.add(cleaned)
            if source_file and not is_placeholder(source_file):
                results.append({"file": source_file, "concepts": sorted(concepts), "connections": sorted(conns)})
    return results


# ── Graph builder ────────────────────────────────────────────────────────

def build_graph(dict_entries: list[dict], batch_data: list[dict]) -> nx.Graph:
    g = nx.Graph()
    for entry in dict_entries:
        canonical = entry.get("Canonical form", "").strip()
        if not canonical:
            continue
        node_type = entry.get("_node_type", NODE_CONCEPT)
        g.add_node(canonical, type=node_type, kind=node_type)
        aliases_raw = entry.get("Aliases", "")
        for alias in split_aliases(aliases_raw):
            g.add_node(alias, type=NODE_TERM, kind=NODE_TERM, canonical=canonical)
            g.add_edge(alias, canonical, rel=EDGE_RELATES_TO)
    for item in batch_data:
        fname = item["file"]
        g.add_node(fname, type=NODE_FILE, kind=NODE_FILE)
        for concept in item["concepts"]:
            g.add_edge(fname, concept, rel=EDGE_MENTIONS)
        for conn in item["connections"]:
            g.add_edge(fname, conn, rel=EDGE_MENTIONS)
    for node_a, node_b, data in list(g.edges(data=True)):
        key = frozenset([node_a, node_b])
    return g


def serialize_graph(g: nx.Graph) -> dict:
    nodes = []
    for n, attrs in g.nodes(data=True):
        nodes.append({"id": n, **attrs})
    edges = []
    for u, v, attrs in g.edges(data=True):
        edges.append({"source": u, "target": v, **attrs})
    return {"nodes": nodes, "edges": edges}


def deserialize_graph(data: dict) -> nx.Graph:
    g = nx.Graph()
    for n in data["nodes"]:
        nid = n.pop("id")
        g.add_node(nid, **n)
    for e in data["edges"]:
        src = e.pop("source")
        tgt = e.pop("target")
        g.add_edge(src, tgt, **e)
    return g


# ── Query ────────────────────────────────────────────────────────────────

def query(term: str, top_n: int = 15) -> dict[str, Any]:
    if not GRAPH_PATH.exists():
        return {"error": f"Graph not found at {GRAPH_PATH}. Run 'python3 .bin/lib/concept-graph.py build' first."}
    data = json.loads(GRAPH_PATH.read_text(encoding="utf-8"))
    g = deserialize_graph(data)
    term_lower = term.lower()
    candidates = [n for n in g.nodes if term_lower in n.lower()]
    if not candidates:
        return {"error": f"Term '{term}' not found in graph.", "suggestions": []}
    results = {"matches": [], "related_concepts": set(), "related_files": set()}
    for cand in candidates:
        neighbors = list(g.neighbors(cand))
        node_type = g.nodes[cand].get("type", "")
        node_kind = g.nodes[cand].get("kind", "")
        neighbor_details = []
        for nb in neighbors:
            nb_type = g.nodes[nb].get("type", "")
            nb_kind = g.nodes[nb].get("kind", "")
            if nb_kind == NODE_FILE:
                results["related_files"].add(nb)
            elif nb_kind in (NODE_CONCEPT, NODE_PERSON, NODE_PLACE, NODE_ORG):
                results["related_concepts"].add(nb)
            neighbor_details.append({"id": nb, "type": nb_type, "kind": nb_kind})
        results["matches"].append({
            "id": cand,
            "type": node_type,
            "kind": node_kind,
            "neighbors": neighbor_details[:top_n],
            "neighbor_count": len(neighbors),
        })
    results["related_concepts"] = sorted(results["related_concepts"])[:top_n]
    results["related_files"] = sorted(results["related_files"])[:top_n]
    return results


# ── MCP Server ──────────────────────────────────────────────────────────

def handle_mcp_request(request: dict) -> dict:
    req_id = request.get("id")
    method = request.get("method", "")
    params = request.get("params", {})
    if method == "initialize":
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {
                "protocolVersion": "2025-03-26",
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "spinosa-concept-graph", "version": "0.1.0"},
            },
        }
    elif method == "tools/list":
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {
                "tools": [
                    {
                        "name": "graph_query",
                        "description": "Query concept graph for a term. Returns related concepts and files.",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "term": {
                                    "type": "string",
                                    "description": "Concept or file path to query",
                                },
                                "top_n": {
                                    "type": "integer",
                                    "description": "Max neighbors per match (default 15)",
                                    "default": 15,
                                },
                            },
                            "required": ["term"],
                        },
                    },
                    {
                        "name": "graph_related_files",
                        "description": "Get all files related to a concept.",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "concept": {
                                    "type": "string",
                                    "description": "Canonical concept name",
                                },
                            },
                            "required": ["concept"],
                        },
                    },
                    {
                        "name": "graph_neighbors",
                        "description": "Get all neighbors of a node in the concept graph.",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "node": {
                                    "type": "string",
                                    "description": "Node ID (concept or file path)",
                                },
                                "top_n": {
                                    "type": "integer",
                                    "description": "Max neighbors to return (default 20)",
                                    "default": 20,
                                },
                            },
                            "required": ["node"],
                        },
                    },
                ]
            },
        }
    elif method == "tools/call":
        tool = params.get("name", "")
        args = params.get("arguments", {})
        if tool == "graph_query":
            result = query(args.get("term", ""), int(args.get("top_n", 15)))
            return {"jsonrpc": "2.0", "id": req_id, "result": {"content": [{"type": "text", "text": json.dumps(result, indent=2)}]}}
        elif tool == "graph_related_files":
            result = query(args.get("concept", ""))
            return {"jsonrpc": "2.0", "id": req_id, "result": {"content": [{"type": "text", "text": json.dumps(result.get("related_files", []), indent=2)}]}}
        elif tool == "graph_neighbors":
            g = deserialize_graph(json.loads(GRAPH_PATH.read_text(encoding="utf-8")))
            node = args.get("node", "")
            top_n = int(args.get("top_n", 20))
            if node not in g:
                return {"jsonrpc": "2.0", "id": req_id, "error": {"code": -32602, "message": f"Node '{node}' not found"}}
            neighbors = [{"id": nb, "type": g.nodes[nb].get("kind", "")} for nb in g.neighbors(node)][:top_n]
            return {"jsonrpc": "2.0", "id": req_id, "result": {"content": [{"type": "text", "text": json.dumps({"node": node, "neighbors": neighbors, "count": len(neighbors)}, indent=2)}]}}
        else:
            return {"jsonrpc": "2.0", "id": req_id, "error": {"code": -32601, "message": f"Unknown tool: {tool}"}}
    elif method == "notifications/initialized":
        return None
    else:
        return {"jsonrpc": "2.0", "id": req_id, "error": {"code": -32601, "message": f"Unknown method: {method}"}}


def serve_mcp():
    while True:
        line = sys.stdin.readline()
        if not line:
            break
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
        except json.JSONDecodeError:
            continue
        response = handle_mcp_request(request)
        if response is not None:
            sys.stdout.write(json.dumps(response) + "\n")
            sys.stdout.flush()


# ── CLI ──────────────────────────────────────────────────────────────────

def cmd_build(args: argparse.Namespace) -> None:
    dict_path = Path(args.dictionary) if args.dictionary else DICT_PATH
    reports_dir = Path(args.reports_dir) if args.reports_dir else REPORTS_DIR
    graph_path = Path(args.output) if args.output else GRAPH_PATH
    if not dict_path.exists():
        print(f"Dictionary not found at {dict_path}")
        sys.exit(1)
    dict_entries = parse_dictionary(dict_path)
    batch_data = parse_extraction_batches(reports_dir)
    g = build_graph(dict_entries, batch_data)
    graph_data = serialize_graph(g)
    print(f"Graph built: {g.number_of_nodes()} nodes, {g.number_of_edges()} edges")
    if args.dry_run:
        print("Dry run: graph JSON was not written.")
    else:
        graph_path.parent.mkdir(parents=True, exist_ok=True)
        graph_path.write_text(json.dumps(graph_data, indent=2), encoding="utf-8")
        print(f"Written to {graph_path}")
    concept_count = sum(1 for _, d in g.nodes(data=True) if d.get("kind") == NODE_CONCEPT)
    file_count = sum(1 for _, d in g.nodes(data=True) if d.get("kind") == NODE_FILE)
    print(f"  Concepts: {concept_count}  Files: {file_count}  Other nodes: {g.number_of_nodes() - concept_count - file_count}")


def cmd_query(args: argparse.Namespace) -> None:
    term = " ".join(args.term) if args.term else ""
    if not term:
        print("Usage: python3 .bin/lib/concept-graph.py query <term>")
        sys.exit(1)
    result = query(term)
    if "error" in result:
        print(f"Error: {result['error']}")
        if result.get("suggestions"):
            print(f"Suggestions: {', '.join(result['suggestions'])}")
        sys.exit(1)
    print(f"Matches for '{term}':\n")
    for m in result["matches"]:
        print(f"  [{m['kind']}] {m['id']}  ({m['neighbor_count']} neighbors)")
        if m["neighbors"]:
            for nb in m["neighbors"][:5]:
                print(f"    -> [{nb['kind']}] {nb['id']}")
            if len(m["neighbors"]) > 5:
                print(f"    ... and {len(m['neighbors']) - 5} more")
        print()
    if result["related_concepts"]:
        print(f"Related concepts ({len(result['related_concepts'])}):")
        for c in result["related_concepts"][:10]:
            print(f"  - {c}")
        print()
    if result["related_files"]:
        print(f"Related files ({len(result['related_files'])}):")
        for f in result["related_files"][:10]:
            print(f"  - [[{f}]]")


def cmd_serve():
    serve_mcp()


def main():
    parser = argparse.ArgumentParser(description="Spinosa Concept Graph Tool")
    sub = parser.add_subparsers(dest="command")
    build_parser = sub.add_parser("build", help="Build concept graph from dictionary and extraction batches")
    build_parser.add_argument("--dictionary", help="Dictionary markdown path for tests or dry runs")
    build_parser.add_argument("--reports-dir", help="Directory containing extraction_batch_*.md files")
    build_parser.add_argument("--output", help="Output graph JSON path")
    build_parser.add_argument("--dry-run", action="store_true", help="Parse inputs and report graph stats without writing JSON")
    query_parser = sub.add_parser("query", help="Query the concept graph for a term")
    query_parser.add_argument("term", nargs=argparse.REMAINDER)
    sub.add_parser("serve", help="Start MCP server (stdio)")
    args = parser.parse_args()
    if args.command == "build":
        cmd_build(args)
    elif args.command == "query":
        cmd_query(args)
    elif args.command == "serve":
        cmd_serve()
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
