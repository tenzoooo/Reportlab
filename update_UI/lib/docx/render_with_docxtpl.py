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


from docx.enum.text import WD_ALIGN_PARAGRAPH

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
      cell = table.cell(r_index, c_index)
      cell.text = value
      # Center align
      if cell.paragraphs:
        cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
      
      # 数値が入らないセルは左上から右下への斜線セルとして表現する
      if _should_draw_diagonal_cell(value, r_index, c_index):
        _apply_diagonal_cell_border(cell)
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
      rt.add(part, font='MS Mincho')
      if idx != len(parts) - 1:
        rt.add("\n")
    return rt

  def consideration_units(units):
    rt = RichText()
    if not isinstance(units, list):
      return rt
    
    first = True
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
        if not first:
          rt.add("\n")
        rt.add(body, font='MS Mincho')
        first = False
    return rt

  env.filters["nl2br"] = nl2br
  env.filters["consideration_units"] = consideration_units
  
  def reference_lines(value):
    rt = RichText()
    if isinstance(value, dict):
      refs_formatted = value.get("reference_list_formatted")
      if isinstance(refs_formatted, list) and len(refs_formatted) > 0:
        for idx, item in enumerate(refs_formatted):
            if item is not None:
                if idx > 0:
                    rt.add("\n")
                rt.add(str(item), font='MS Mincho')
        return rt
        
      refs = value.get("references")
      if isinstance(refs, list) and len(refs) > 0:
        first = True
        for ref in refs:
          if not isinstance(ref, dict):
            continue
          _id = ref.get("id") or ""
          title = ref.get("title") or ""
          year = ref.get("year") or ""
          line = f"[{_id}] {title} {year}".strip()
          if line:
            if not first:
                rt.add("\n")
            rt.add(line, font='MS Mincho')
            first = False
        if not first: # If we added at least one line
          return rt
          
    rt.add("（参考文献の記載なし）", font='MS Mincho')
    return rt
  env.filters["reference_lines"] = reference_lines
  return env


def _should_draw_diagonal_cell(value: str, row_index: int, col_index: int) -> bool:
  """
  Decide whether to draw a diagonal (top-left to bottom-right) line in the cell.

  Rule:
  - Only body cells (skip header row and header column: index 0)
  - Cell text is empty or a simple placeholder such as "-" or "ー"
  """
  # Skip header row / header column
  if row_index == 0 or col_index == 0:
    return False

  text = (value or "").strip()
  if not text:
    return True

  # Treat common "no data" placeholders as empty
  if text in {"-", "ー", "―"}:
    return True

  return False


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


def _apply_diagonal_cell_border(cell) -> None:
  """
  Apply a diagonal border from top-left to bottom-right for a single cell.
  """
  tc = cell._tc
  tc_pr = getattr(tc, "tcPr", None)
  if tc_pr is None:
    tc_pr = OxmlElement("w:tcPr")
    tc.append(tc_pr)

  borders = tc_pr.find(qn("w:tcBorders"))
  if borders is None:
    borders = OxmlElement("w:tcBorders")
    tc_pr.append(borders)

  diag = borders.find(qn("w:tl2br"))
  if diag is None:
    diag = OxmlElement("w:tl2br")
    borders.append(diag)

  diag.set(qn("w:val"), "single")
  diag.set(qn("w:sz"), "8")  # 0.5pt
  diag.set(qn("w:space"), "0")
  diag.set(qn("w:color"), "000000")


def render_report(payload: dict) -> bytes:
  """
  Render the report and return the DOCX bytes.
  Accepts a payload dictionary with:
  - template_path: str (optional, path to template file)
  - template_base64: str (optional, base64 encoded template)
  - context: dict (data to render)
  """
  template_path = payload.get("template_path", "")
  template_base64 = payload.get("template_base64", "")
  context = payload.get("context") or {}

  if template_base64:
    template_file = BytesIO(base64.b64decode(template_base64))
  elif template_path:
    resolved_path = Path(template_path).expanduser()
    if not resolved_path.exists():
      raise FileNotFoundError(f"Template not found: {resolved_path}")
    template_file = resolved_path
  else:
    raise ValueError("Either template_path or template_base64 must be provided")

  doc = DocxTemplate(template_file)
  context_with_images = inject_inline_images(doc, context)
  context_with_tables = inject_tables(doc, context_with_images)
  env = build_jinja_env()
  doc.render(context_with_tables, jinja_env=env)
  
  output_io = BytesIO()
  doc.save(output_io)
  return output_io.getvalue()


def main() -> int:
  try:
    payload = json.load(sys.stdin)
  except Exception as exc:  # pragma: no cover
    sys.stderr.write(f"Failed to load JSON payload: {exc}\n")
    return 1

  output_path = Path(payload.get("output_path", "")).expanduser()
  
  try:
    docx_bytes = render_report(payload)
    
    if output_path:
      output_path.parent.mkdir(parents=True, exist_ok=True)
      with open(output_path, "wb") as f:
        f.write(docx_bytes)
    else:
      # If no output path, maybe stdout? But usually we want a file.
      # For now, just error if no output path in CLI mode.
      sys.stderr.write("output_path is required for CLI usage\n")
      return 2

  except Exception as exc:  # pragma: no cover
    sys.stderr.write(f"Failed to render DOCX with docxtpl: {exc}\n")
    return 3

  return 0


if __name__ == "__main__":
  sys.exit(main())
