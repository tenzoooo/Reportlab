#!/usr/bin/env python3
import base64
import json
import sys
from io import BytesIO
from pathlib import Path
from typing import Any, Optional

from docxtpl import DocxTemplate, InlineImage, RichText
from jinja2 import Environment
from docx.shared import Mm
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

TARGET_WIDTH_MM = 106.29
TARGET_HEIGHT_MM = 60.57


def px_to_mm(px: float, dpi: float = 96.0) -> float:
  """Convert pixels to millimeters assuming the given DPI."""
  return float(px) / dpi * 25.4


def inject_inline_images(doc: DocxTemplate, context: dict) -> dict:
  """
  Replace figure_image entries that carry base64 data with InlineImage instances.
  Mutates figures in-place and returns the resulting context.
  """
  experiments = context.get("experiments") or []
  for exp in experiments:
    figures = exp.get("figures") or []
    figure_cursor = 0
    for fig in figures:
      image = fig.get("figure_image")
      if not isinstance(image, dict):
        continue

      b64 = image.get("buffer")
      if not b64:
        fig["figure_image"] = None
        continue

      try:
        raw = base64.b64decode(b64)
      except Exception:
        fig["figure_image"] = None
        continue

      width = image.get("width")
      height = image.get("height")
      # Force images to unified target size. If explicit pixel sizes exist, they are ignored to keep consistency.
      width_mm = TARGET_WIDTH_MM
      height_mm = TARGET_HEIGHT_MM

      fig["figure_image"] = InlineImage(
        doc,
        BytesIO(raw),
        width=Mm(width_mm) if width_mm else None,
        height=Mm(height_mm) if height_mm else None,
      )

    # Keep blocks in sync when they reference figures.
    blocks = exp.get("blocks") or []
    for block in blocks:
      if isinstance(block, dict) and block.get("type") == "figure":
        block["figure"] = block.get("figure") or {}
        assigned = False
        matched_index = -1
        # find matching figure by label/caption if present
        if figures:
          for idx, fig in enumerate(figures):
            if (
              isinstance(fig, dict)
              and fig.get("label") == block["figure"].get("label")
              and fig.get("caption") == block["figure"].get("caption")
            ):
              block["figure"] = fig
              assigned = True
              matched_index = idx
              break
        if matched_index >= 0:
          figure_cursor = max(figure_cursor, matched_index + 1)
        # fallback: assign by order when labels are absent/duplicated
        if not assigned and figure_cursor < len(figures):
          block["figure"] = figures[figure_cursor]
          figure_cursor += 1
  return context


def build_table_subdoc(doc: DocxTemplate, rows) -> Optional[Any]:
  """
  Build a subdocument containing a simple grid table from a 2D rows array.
  Each cell is cast to string and empty strings are used for missing cells.
  """
  if not isinstance(rows, list) or len(rows) == 0:
    return None

  max_cols = 0
  for row in rows:
    if isinstance(row, list) and len(row) > max_cols:
      max_cols = len(row)
  if max_cols == 0:
    return None

  sub = doc.new_subdoc()
  table = sub.add_table(rows=len(rows), cols=max_cols)
  table.style = "Table Grid"
  _apply_table_borders(table)

  for r_index, row in enumerate(rows):
    if not isinstance(row, list):
      row = [""]
    for c_index in range(max_cols):
      value = ""
      if c_index < len(row):
        cell_value = row[c_index]
        value = str(cell_value) if cell_value is not None else ""
      table.cell(r_index, c_index).text = value
  return sub


def inject_tables(doc: DocxTemplate, context: dict) -> dict:
  """
  Replace table rows arrays with subdocuments so docxtpl can render them.
  """
  experiments = context.get("experiments") or []
  for exp in experiments:
    tables = exp.get("tables") or []
    table_cursor = 0
    for table in tables:
      rows = table.get("rows")
      subdoc = build_table_subdoc(doc, rows)
      if subdoc:
        table["body"] = subdoc
    # Keep blocks in sync when they reference tables.
    blocks = exp.get("blocks") or []
    for block in blocks:
      if isinstance(block, dict) and block.get("type") == "table":
        ref = block.get("table")
        matched_index = -1
        if ref and isinstance(ref, dict) and tables:
          for idx, tbl in enumerate(tables):
            if (
              isinstance(tbl, dict)
              and tbl.get("label") == ref.get("label")
              and tbl.get("caption") == ref.get("caption")
            ):
              block["table"] = tbl
              ref = tbl
              matched_index = idx
              break
        if matched_index >= 0:
          table_cursor = max(table_cursor, matched_index + 1)
        if (not ref or not isinstance(ref, dict)) and table_cursor < len(tables):
          block["table"] = tables[table_cursor]
          table_cursor += 1
  return context


def build_jinja_env() -> Environment:
  env = Environment(autoescape=False)

  def nl2br(value):
    rt = RichText()
    if value is None:
      return rt
    parts = str(value).split("\n")
    for idx, part in enumerate(parts):
      rt.add(part)
      if idx != len(parts) - 1:
        rt.add("\n")
    return rt

  def consideration_units(units) -> str:
    if not isinstance(units, list):
      return ""
    lines = []
    for unit in units:
      if not isinstance(unit, dict):
        continue
      idx = unit.get("index") or ""
      discussion = unit.get("discussion_active") or ""
      answer = unit.get("answer") or ""
      body = f"（{idx}）{discussion}".strip()
      if answer:
        body = f"{body}\n{answer}"
      if body:
        lines.append(body)
    return "\n".join(lines)

  env.filters["nl2br"] = nl2br
  env.filters["consideration_units"] = consideration_units
  def reference_lines(value) -> str:
    if isinstance(value, dict):
      refs_formatted = value.get("reference_list_formatted")
      if isinstance(refs_formatted, list) and len(refs_formatted) > 0:
        return "\n".join(str(item) for item in refs_formatted if item is not None)
      refs = value.get("references")
      if isinstance(refs, list) and len(refs) > 0:
        lines = []
        for ref in refs:
          if not isinstance(ref, dict):
            continue
          _id = ref.get("id") or ""
          title = ref.get("title") or ""
          year = ref.get("year") or ""
          line = f"[{_id}] {title} {year}".strip()
          if line:
            lines.append(line)
        if lines:
          return "\n".join(lines)
    return "（参考文献の記載なし）"
  env.filters["reference_lines"] = reference_lines
  return env


def _apply_table_borders(table) -> None:
  """
  Ensure grid lines are visible by setting borders explicitly.
  """
  tbl = table._tbl
  tbl_pr = getattr(tbl, "tblPr", None)
  if tbl_pr is None:
    tbl_pr = OxmlElement("w:tblPr")
    tbl.append(tbl_pr)

  borders = tbl_pr.find(qn("w:tblBorders"))
  if borders is None:
    borders = OxmlElement("w:tblBorders")
    tbl_pr.append(borders)

  for tag in ["top", "left", "bottom", "right", "insideH", "insideV"]:
    element = borders.find(qn(f"w:{tag}"))
    if element is None:
      element = OxmlElement(f"w:{tag}")
      borders.append(element)
    element.set(qn("w:val"), "single")
    element.set(qn("w:sz"), "8")  # 0.5pt
    element.set(qn("w:space"), "0")
    element.set(qn("w:color"), "000000")


def main() -> int:
  try:
    payload = json.load(sys.stdin)
  except Exception as exc:  # pragma: no cover
    sys.stderr.write(f"Failed to load JSON payload: {exc}\n")
    return 1

  template_path = Path(payload.get("template_path", "")).expanduser()
  output_path = Path(payload.get("output_path", "")).expanduser()
  context = payload.get("context") or {}

  if not template_path.exists():
    sys.stderr.write(f"Template not found: {template_path}\n")
    return 2

  output_path.parent.mkdir(parents=True, exist_ok=True)

  try:
    doc = DocxTemplate(template_path)
    context_with_images = inject_inline_images(doc, context)
    context_with_tables = inject_tables(doc, context_with_images)
    env = build_jinja_env()
    doc.render(context_with_tables, jinja_env=env)
    doc.save(output_path)
  except Exception as exc:  # pragma: no cover
    sys.stderr.write(f"Failed to render DOCX with docxtpl: {exc}\n")
    return 3

  return 0


if __name__ == "__main__":
  sys.exit(main())
