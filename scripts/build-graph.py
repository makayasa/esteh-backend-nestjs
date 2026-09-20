"""Generate graph from reviewed source/document allowlist; never scan repo root."""
import json
from pathlib import Path
import re
import tempfile
import shutil

from graphify.build import build_from_json
from graphify.cluster import cluster
from graphify.detect import detect
from graphify.export import to_json
from graphify.extract import extract

ROOT = Path(__file__).resolve().parents[1]
DOCS = ["CONTEXT.md", "docs/plans/mvp-decisions.md", "docs/plans/mvp-implementation-plan.md", "docs/api.md", "README.md"]
OUT = ROOT / "graphify-out"


def main():
    files = sorted(p for folder in ("src", "test") for p in (ROOT / folder).rglob("*.ts")
                   if "generated" not in p.relative_to(ROOT).parts)
    files += [ROOT / name for name in DOCS]
    for path in files:
        if path.resolve() != path or not path.resolve().is_relative_to(ROOT):
            raise ValueError("Symlink/outside source rejected")
        text = path.read_text().replace('postgresql://test:test@127.0.0.1:', '')
        if re.search(r"-----BEGIN .*PRIVATE KEY|(?:postgres(?:ql)?://)[^\s'\"`]+:[^\s'\"`]+@|AKIA[0-9A-Z]{16}", text):
            raise ValueError(f"Review possible credential in {path.relative_to(ROOT)}")
    OUT.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="esteh-graph-") as directory:
        corpus = Path(directory)
        for path in files:
            target = corpus / path.relative_to(ROOT)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(path, target)
        detected = detect(corpus)
        print(f"Corpus allowlist: {len(files)} files; {detected.get('total_words', 0)} words")
        data = extract([corpus / p.relative_to(ROOT) for p in files if p.suffix == ".ts"],
                       cache_root=corpus, parallel=False)
        # ponytail: docs use headings/links only, not semantic inference; use reviewed
        # agent semantic extraction when cross-document concept search is needed.
        for name in DOCS:
            node_id = f"doc:{name}"
            data["nodes"].append({"id": node_id, "label": Path(name).stem,
                                  "source_file": name, "file_type": "document"})
            for number, line in enumerate((corpus / name).read_text().splitlines(), 1):
                if re.match(r"^#{1,6} ", line):
                    heading_id = f"{node_id}:{number}"
                    data["nodes"].append({"id": heading_id, "label": line.lstrip("# "),
                                          "source_file": name, "source_location": f"{name}:{number}",
                                          "file_type": "document"})
                    data["edges"].append({"source": node_id, "target": heading_id,
                                          "relation": "contains", "confidence": "EXTRACTED",
                                          "source_file": name})
        # Normalize before exporting so temporary absolute paths never escape.
        for node in data["nodes"]:
            for field in ("id", "source_file", "source_location"):
                if isinstance(node.get(field), str):
                    node[field] = node[field].replace(str(corpus) + "/", "")
        for edge in data["edges"]:
            for field in ("source", "target"):
                edge[field] = edge[field].replace(str(corpus) + "/", "")
        from graphify.diagnostics import diagnose_extraction
        diagnostics = diagnose_extraction(data, directed=False, root=corpus)
        print('Raw extraction diagnostics:', {key: diagnostics[key] for key in
              ('dangling_endpoint_edges', 'missing_endpoint_edges', 'self_loop_edges',
               'undirected_same_endpoint_collapsed_edges')})
        graph = build_from_json(data, root=corpus)
        if not graph.number_of_nodes():
            raise ValueError("Empty extraction")
        communities = cluster(graph)
        if not to_json(graph, communities, str(OUT / "graph.json"), force=True):
            raise ValueError("Graph not written")
    allowed = {p.relative_to(ROOT).as_posix() for p in files}
    output = json.loads((OUT / "graph.json").read_text())
    sources = {n.get("source_file") for n in output["nodes"] if n.get("source_file")}
    assert sources <= allowed, sources - allowed
    assert all(not any(part in {"generated", "uploads", ".env", "node_modules"}
                       for part in Path(s).parts) for s in sources)
    (OUT / "manifest.json").write_text(json.dumps({"files": sorted(allowed),
        "nodes": graph.number_of_nodes(), "edges": graph.number_of_edges(),
        "audit": "All node source_file values belong to reviewed allowlist; no runtime data scanned",
        "raw_extraction_diagnostics": {key: diagnostics[key] for key in
            ('dangling_endpoint_edges', 'missing_endpoint_edges', 'self_loop_edges',
             'undirected_same_endpoint_collapsed_edges')},
        "semantic_llm_tokens": 0}, indent=2) + "\n")
    (OUT / "GRAPH_REPORT.md").write_text(
        f"# Graph project\n\n{graph.number_of_nodes()} nodes, {graph.number_of_edges()} edges.\n"
        "AST code + document headings; no semantic LLM inference. LLM tokens: 0.\n"
        "Source audit: allowlist only. See manifest.json for raw extraction diagnostics.\n"
        "WARNING: raw AST edges to unresolved imports/symbols may be omitted by Graphify.\n"
        "Graph is navigation aid, not proof of complete dependency coverage.\n"
        "See manifest.json for complete corpus. Rebuild: scripts/build-graph.py.\n")
    print(f"Graph: {graph.number_of_nodes()} nodes, {graph.number_of_edges()} edges; source audit passed")


if __name__ == "__main__":
    main()
