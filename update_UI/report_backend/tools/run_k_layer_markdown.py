from __future__ import annotations

import argparse
import json
from pathlib import Path

from core.config import load_settings


def _load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _chapter_number(data: dict) -> str:
    chapter = str(((data.get("b_layer_bundle") or {}).get("method") or {}).get("chapter") or "").strip()
    if not chapter:
        return "?"
    try:
        return str(int(chapter) + 1)
    except ValueError:
        return chapter


def _parent_key(entry: dict) -> str:
    parent = entry.get("experiment_parent") or {}
    exp_key = str(parent.get("exp_key") or "").strip()
    if not exp_key:
        return ""
    parts = exp_key.split(".")
    if not parts:
        return exp_key
    try:
        parts[0] = str(int(parts[0]) + 1)
        return ".".join(parts)
    except ValueError:
        return exp_key


def _parent_title(entry: dict) -> str:
    parent = entry.get("experiment_parent") or {}
    return str(parent.get("title") or "").strip()


def _exp_key(entry: dict) -> str:
    return str(entry.get("experiment_number") or entry.get("experiment_name") or entry.get("exp_key") or "").strip()


def _exp_title(entry: dict) -> str:
    return str(entry.get("experiment_name") or "").strip()


def _format_tables(tables: list[dict]) -> list[str]:
    blocks: list[str] = []
    for t in tables:
        label = str(t.get("label") or "").strip()
        caption = str(t.get("caption") or "").strip()
        header = " ".join([p for p in [label, caption] if p]).strip()
        if header:
            blocks.append(f'<div align="center"><b>{header}</b></div>')
        rows = t.get("rows") or []
        if not rows:
            continue
        # Render as pipe table
        header_row = rows[0]
        blocks.append('<div align="center">')
        blocks.append("| " + " | ".join(header_row) + " |")
        blocks.append("| " + " | ".join(["---"] * len(header_row)) + " |")
        for r in rows[1:]:
            blocks.append("| " + " | ".join([str(x) for x in r]) + " |")
        blocks.append("</div>")
        blocks.append("")
    return blocks


def _format_graphs(graphs: list[dict], *, storage_root: Path) -> list[str]:
    blocks: list[str] = []
    for g in graphs:
        label = str(g.get("label") or "").strip()
        caption = str(g.get("caption") or "").strip()
        storage_key = str(g.get("storage_key") or "").strip()
        if storage_key:
            img_path = (storage_root / storage_key).resolve()
            blocks.append('<div align="center">')
            blocks.append(f'<img src="{img_path.as_posix()}" width="1400" />')
            blocks.append("</div>")
        footer = " ".join([p for p in [label, caption] if p]).strip()
        if footer:
            blocks.append(f'<div align="center"><b>{footer}</b></div>')
        blocks.append("")
    return blocks


def main() -> None:
    parser = argparse.ArgumentParser(description="Build K-layer markdown from J-layer JSON.")
    parser.add_argument("--input", default="tmp_state_outputs/j_layer_merged.json")
    parser.add_argument("--out", default="tmp_state_outputs/k_layer_markdown_all.md")
    args = parser.parse_args()

    input_path = Path(args.input)
    out_path = Path(args.out)
    if not input_path.exists():
        raise SystemExit(f"INPUT_NOT_FOUND: {input_path}")

    data = _load_json(input_path)
    chapter = _chapter_number(data)
    pages = list(data.get("result_page") or [])
    settings = load_settings()
    storage_root = settings.storage_dir

    lines: list[str] = []
    lines.append(f"# {chapter}.実験結果")
    lines.append("")

    # Group by parent experiment
    by_parent: dict[str, list[dict]] = {}
    parent_titles: dict[str, str] = {}
    for page in pages:
        pkey = _parent_key(page)
        by_parent.setdefault(pkey, []).append(page)
        if pkey and pkey not in parent_titles:
            parent_titles[pkey] = _parent_title(page)

    for parent_key in sorted(by_parent.keys(), key=lambda k: k or ""):
        parent_title = parent_titles.get(parent_key, "")
        if parent_key:
            lines.append(f"## {parent_key} {parent_title}".strip())
            lines.append("")
        for page in by_parent[parent_key]:
            exp_key = _exp_key(page)
            exp_title = _exp_title(page)
            lines.append(f"### {exp_key} {exp_title}".strip())
            lines.append("")
            method_summary = str(page.get("method_summary") or "").strip()
            result_description = str(page.get("result_description") or "").strip()
            if method_summary:
                lines.append(method_summary)
                lines.append("")
            if result_description:
                lines.append(result_description)
                lines.append("")
            tables = list(page.get("tables") or [])
            graphs = list(page.get("graphs") or [])
            lines.extend(_format_tables(tables))
            lines.extend(_format_graphs(graphs, storage_root=storage_root))
            quant = page.get("quant_comment") or []
            if quant:
                text = str(quant[0].get("quant_comment") or "").strip()
                if text:
                    lines.append(text)
                    lines.append("")

    footer = data.get("results_page_footer") or {}
    footer_markdown = str(footer.get("markdown") or "").strip()
    if footer_markdown:
        lines.append(footer_markdown)
        lines.append("")

    out_path.write_text("\n".join(lines).strip() + "\n", encoding="utf-8")
    print(out_path)


if __name__ == "__main__":
    main()
