from __future__ import annotations

from docxtpl import RichText


def nl2br(value: str | None) -> RichText:
    rt = RichText()
    if value is None:
        return rt
    parts = str(value).split("\n")
    for idx, part in enumerate(parts):
        rt.add(part.strip())
        if idx != len(parts) - 1:
            rt.add("\n")
    return rt


def consideration_units(units: list[dict] | list | None) -> str:
    if not isinstance(units, list):
        return ""
    chunks: list[str] = []
    for unit in units:
        if not isinstance(unit, dict):
            continue
        index = str(unit.get("index") or "").strip()
        discussion = str(unit.get("discussion_active") or "").strip()
        if not index and not discussion:
            continue
        body = f"({index}){discussion}".strip()
        chunks.append(body)
    return "\n".join(chunks)


def reference_lines(consideration: dict | None) -> str:
    if not isinstance(consideration, dict):
        return "（参考文献の記載なし）"

    formatted = consideration.get("reference_list_formatted")
    if isinstance(formatted, list) and formatted:
        lines = [str(v).strip() for v in formatted if str(v).strip()]
        return "\n".join(lines) if lines else "（参考文献の記載なし）"

    refs = consideration.get("references")
    if isinstance(refs, list) and refs:
        lines: list[str] = []
        for ref in refs:
            if not isinstance(ref, dict):
                continue
            ref_id = str(ref.get("id") or "").strip()
            title = str(ref.get("title") or "").strip()
            year = str(ref.get("year") or "").strip()
            line = f"[{ref_id}] {title} {year}".strip()
            if line:
                lines.append(line)
        return "\n".join(lines) if lines else "（参考文献の記載なし）"

    return "（参考文献の記載なし）"
