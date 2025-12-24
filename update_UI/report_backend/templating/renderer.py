from __future__ import annotations

import logging
from io import BytesIO
from pathlib import Path
from typing import Any

from docxtpl import DocxTemplate, InlineImage, RichText
from docx.shared import Mm
from jinja2 import Environment, TemplateSyntaxError

from core.storage import Storage
from models.contracts import ImageAsset
from templating.filters import consideration_units, nl2br, reference_lines


logger = logging.getLogger(__name__)

TARGET_WIDTH_MM = 106.29
TARGET_HEIGHT_MM = 60.57


def _build_env() -> Environment:
    env = Environment(autoescape=False)
    env.filters["nl2br"] = nl2br
    env.filters["consideration_units"] = consideration_units
    env.filters["reference_lines"] = reference_lines
    return env


def _create_consideration_units_rt(units: Any) -> RichText:
    return nl2br(consideration_units(units if isinstance(units, list) else []))


def _create_references_rt(consideration: Any) -> RichText:
    return nl2br(reference_lines(consideration if isinstance(consideration, dict) else {}))


def _patch_template(doc: DocxTemplate, context: dict) -> None:
    docx_obj = doc.get_docx()
    if not docx_obj:
        return

    replacements = {
        "{{ consideration.units | consideration_units | nl2br }}": "{{ consideration_units_rt }}",
        "{{ consideration.units | consideration_units }}": "{{ consideration_units_rt }}",
        "{{ consideration | reference_lines | nl2br }}": "{{ references_rt }}",
        "{{ consideration | reference_lines }}": "{{ references_rt }}",
    }

    block_loop_found = False
    inserted_block_loop = False

    def patch_paragraphs(paragraphs):
        nonlocal inserted_block_loop, block_loop_found
        for p in paragraphs:
            text = p.text
            if not text:
                continue

            if "{% for block in exp.blocks" in text:
                block_loop_found = True

            if "{% if block.type" in text and not block_loop_found and not inserted_block_loop:
                p.text = "{% for block in exp.blocks %}" + text
                inserted_block_loop = True
                block_loop_found = True
                text = p.text

            original = text
            modified = original
            for old, new in replacements.items():
                if old in modified:
                    modified = modified.replace(old, new)
            if modified != original:
                p.text = modified

    patch_paragraphs(docx_obj.paragraphs)
    for t in docx_obj.tables:
        for row in t.rows:
            for cell in row.cells:
                patch_paragraphs(cell.paragraphs)


def _inject_inline_images(
    doc: DocxTemplate,
    context: dict,
    images_by_id: dict[str, ImageAsset],
    storage: Storage,
    *,
    image_bytes_by_id: dict[str, bytes] | None = None,
) -> None:
    experiments = context.get("experiments") or []
    for exp in experiments:
        blocks = exp.get("blocks") or []
        for block in blocks:
            if not isinstance(block, dict) or block.get("type") != "figure":
                continue
            fig = block.get("figure")
            if not isinstance(fig, dict):
                continue
            image_id = fig.get("figure_image_id")
            if not image_id:
                continue
            raw: bytes | None = None
            if image_bytes_by_id is not None:
                raw = image_bytes_by_id.get(str(image_id))
            if raw is None:
                asset = images_by_id.get(str(image_id))
                if not asset:
                    continue
                raw = storage.get_bytes(asset.storage_key)
            fig["figure_image"] = InlineImage(
                doc,
                BytesIO(raw),
                width=Mm(TARGET_WIDTH_MM),
                height=Mm(TARGET_HEIGHT_MM),
            )


def _build_table_subdoc(doc: DocxTemplate, rows: Any):
    if not isinstance(rows, list) or not rows:
        return None
    max_cols = max((len(r) for r in rows if isinstance(r, list)), default=0)
    if max_cols <= 0:
        return None
    sub = doc.new_subdoc()
    table = sub.add_table(rows=len(rows), cols=max_cols)
    table.style = "Table Grid"
    for r_idx, row in enumerate(rows):
        row_list = row if isinstance(row, list) else []
        for c_idx in range(max_cols):
            val = ""
            if c_idx < len(row_list):
                val = "" if row_list[c_idx] is None else str(row_list[c_idx])
            table.cell(r_idx, c_idx).text = val
    return sub


def _inject_tables(doc: DocxTemplate, context: dict) -> None:
    experiments = context.get("experiments") or []
    for exp in experiments:
        blocks = exp.get("blocks") or []
        for block in blocks:
            if not isinstance(block, dict) or block.get("type") != "table":
                continue
            tbl = block.get("table")
            if not isinstance(tbl, dict):
                continue
            subdoc = _build_table_subdoc(doc, tbl.get("rows"))
            if subdoc is not None:
                tbl["body"] = subdoc


def render_docx_bytes(
    *,
    template_path: str,
    context: dict,
    storage: Storage,
    job_id: str,
    image_bytes_by_id: dict[str, bytes] | None = None,
) -> bytes:
    template_file = Path(template_path)
    if not template_file.exists():
        raise FileNotFoundError(f"Template not found: {template_file}")

    doc = DocxTemplate(str(template_file))

    # Pre-calculate rich text values and patch template tags.
    context["consideration_units_rt"] = _create_consideration_units_rt(context.get("consideration", {}).get("units"))
    context["references_rt"] = _create_references_rt(context.get("consideration", {}))
    _patch_template(doc, context)

    images_by_id: dict[str, ImageAsset] = {}

    # We encode assets into the context when we call render (preferred).
    assets_images = context.pop("__assets_images", None)
    if isinstance(assets_images, dict):
        images_by_id = {k: ImageAsset.model_validate(v) for k, v in assets_images.items()}

    _inject_inline_images(doc, context, images_by_id, storage, image_bytes_by_id=image_bytes_by_id)
    _inject_tables(doc, context)

    env = _build_env()
    try:
        doc.render(context, jinja_env=env)
    except TemplateSyntaxError as exc:
        raise RuntimeError(f"Docx template parse failed: {exc}") from exc

    out = BytesIO()
    doc.save(out)
    return out.getvalue()
