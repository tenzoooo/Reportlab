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
from docx.table import _Cell, Table  # type: ignore
from docx.enum.table import WD_ALIGN_VERTICAL
from docx.text.paragraph import Paragraph

import re
import traceback

TARGET_WIDTH_MM = 106.29
TARGET_HEIGHT_MM = 60.57


def _strip_artifacts_from_paragraph(paragraph: Paragraph) -> None:
  """Remove literal OpenXML tag strings that may appear in run text."""
  for run in paragraph.runs:
    if not run.text:
      continue
    # Use regex to remove any XML-like tags (e.g. <w:r>, </w:t>, <w:t ...>)
    # This handles variations in attributes and spacing.
    original_text = run.text
    text = re.sub(r'<[/]?[a-zA-Z0-9:]+[^>]*>', '', run.text)
    if text != run.text:
      print(f"[DEBUG] Stripped artifacts from run: {original_text} -> {text}", file=sys.stderr)
      run.text = text


def _strip_artifacts_from_table(table: Table) -> None:
  for row in table.rows:
    for cell in row.cells:
      for para in cell.paragraphs:
        _strip_artifacts_from_paragraph(para)
      for nested in cell.tables:
        _strip_artifacts_from_table(nested)


def strip_openxml_artifacts(docx_document) -> None:
  """Remove literal OpenXML tag strings from the rendered document."""
  for para in docx_document.paragraphs:
    _strip_artifacts_from_paragraph(para)
  for table in docx_document.tables:
    _strip_artifacts_from_table(table)


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
      cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
      for paragraph in cell.paragraphs:
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        paragraph.paragraph_format.keep_with_next = True
        
        # Convert units to OMML if detected
        if _is_unit_text(value):
          _convert_paragraph_to_omml(paragraph, value)
      
      # 数値が入らないセルは左上から右下への斜線セルとして表現する
      if _should_draw_diagonal_cell(value, r_index, c_index):
        _apply_diagonal_cell_border(cell)
    
    _prevent_row_breaking(table.rows[r_index])
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

def inject_blocks(doc: DocxTemplate, context: dict) -> dict:
  """
  Process 'sections' -> 'subsections' -> 'content_blocks' structure.
  Convert table blocks to subdocs and figure blocks to InlineImage.
  """
  sections = context.get("sections") or []
  for section in sections:
    subsections = section.get("subsections") or []
    for subsection in subsections:
      blocks = subsection.get("content_blocks") or []
      for block in blocks:
        b_type = block.get("type")
        content = block.get("content")
        
        if b_type == "table":
          # content is expected to be a dict with 'rows' or just rows
          rows = []
          if isinstance(content, dict):
             rows = content.get("rows")
          elif isinstance(content, list):
             rows = content
          
          subdoc = build_table_subdoc(doc, rows)
          if subdoc:
            block["content"] = subdoc
            
        elif b_type == "figure":
          # content is expected to be a dict with 'figure_image'
          # figure_image has 'buffer' (base64)
          image_data = content.get("figure_image") if isinstance(content, dict) else None
          if image_data:
             b64 = image_data.get("buffer")
             if b64:
               try:
                 raw = base64.b64decode(b64)
                 width = image_data.get("width")
                 height = image_data.get("height")
                 width_mm = TARGET_WIDTH_MM
                 height_mm = TARGET_HEIGHT_MM
                 
                 block["content"] = InlineImage(
                    doc,
                    BytesIO(raw),
                    width=Mm(width_mm) if width_mm else None,
                    height=Mm(height_mm) if height_mm else None,
                 )
               except Exception as e:
                 print(f"[WARN] Failed to process figure image: {e}", file=sys.stderr)
                 block["content"] = ""
          else:
             # If no image data, maybe just caption?
             pass

  return context

def _clean_text(value) -> str:
  """Strip leading/trailing whitespace to avoid xml:space=\"preserve\"."""
  return "" if value is None else str(value).strip()

def create_consideration_units_rt(units) -> RichText:
  rt = RichText()
  if not isinstance(units, list):
    return rt
  
  first = True
  for unit in units:
    if not isinstance(unit, dict):
      continue
    idx = _clean_text(unit.get("index"))
    discussion = _clean_text(unit.get("discussion_active"))
    answer = _clean_text(unit.get("answer"))
    
    body = f"（{idx}）{discussion}".strip()
    if answer:
      body = f"{body}\n{answer}"
    
    if body:
      if not first:
        rt.add("\n")
      rt.add(body)
      first = False
  return rt

def create_reference_lines_rt(value) -> RichText:
  rt = RichText()
  if isinstance(value, dict):
    refs_formatted = value.get("reference_list_formatted")
    if isinstance(refs_formatted, list) and len(refs_formatted) > 0:
      for idx, item in enumerate(refs_formatted):
          text = _clean_text(item)
          if text:
              if idx > 0:
                  rt.add("\n")
              rt.add(text)
      return rt
      
    refs = value.get("references")
    if isinstance(refs, list) and len(refs) > 0:
      first = True
      for ref in refs:
        if not isinstance(ref, dict):
          continue
        _id = _clean_text(ref.get("id"))
        title = _clean_text(ref.get("title"))
        year = _clean_text(ref.get("year"))
        line = f"[{_id}] {title} {year}".strip()
        if line:
          if not first:
              rt.add("\n")
          rt.add(line)
          first = False
      if not first: # If we added at least one line
        return rt
        
  rt.add("（参考文献の記載なし）")
  return rt

def build_jinja_env() -> Environment:
  env = Environment(autoescape=False)

  def nl2br(value):
    rt = RichText()
    if value is None:
      return rt
    parts = str(value).split("\n")
    for idx, part in enumerate(parts):
      rt.add(_clean_text(part))
      if idx != len(parts) - 1:
        rt.add("\n")
    return rt

  # Register filters for backward compatibility or other uses
  env.filters["nl2br"] = nl2br
  env.filters["consideration_units"] = create_consideration_units_rt
  env.filters["reference_lines"] = create_reference_lines_rt
  return env


def _should_draw_diagonal_cell(value: str, row_index: int, col_index: int) -> bool:
  """
  Decide whether to draw a diagonal (top-left to bottom-right) line in the cell.
  """
  if row_index == 0 or col_index == 0:
    return False

  text = (value or "").strip()
  if not text:
    return True

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


def _prevent_row_breaking(row) -> None:
  """
  Prevent a table row from breaking across pages.
  """
  tr = row._tr
  tr_pr = getattr(tr, "trPr", None)
  if tr_pr is None:
    tr_pr = OxmlElement("w:trPr")
    tr.append(tr_pr)
  
  cant_split = tr_pr.find(qn("w:cantSplit"))
  if cant_split is None:
    cant_split = OxmlElement("w:cantSplit")
    tr_pr.append(cant_split)


def _is_unit_text(text: str) -> bool:
  """
  Check if the text looks like a unit definition.
  Supports:
  - Square brackets: Vbe[V]
  - Parentheses with known units: Length (m)
  - Standalone known units: m
  """
  text = (text or "").strip()
  if not text:
    return False

  # Simple heuristic: contains square brackets
  if "[" in text and "]" in text:
    return True

  # Extended unit list
  UNIT_SYMBOLS = {
      "m", "kg", "s", "A", "K", "mol", "cd", "Hz", "N", "Pa", "J", "W", "C", "V", "F", "Ω", "S", "Wb", "T", "H",
      "℃", "Bq", "Gy", "Sv", "rad", "sr", "lm", "lx", "dyn", "erg", "atm", "Torr", "cal", "eV", "Å"
  }

  # Exact match
  if text in UNIT_SYMBOLS:
    return True

  # Check for (Unit)
  # We look for content inside the last set of parentheses
  match = re.search(r'\((.+?)\)', text)
  if match:
      # Check if any of the captured groups match a unit
      # Actually re.search returns the first match.
      # Let's iterate all matches or just check if *any* parenthesized part is a unit.
      # But usually unit is at the end.
      
      # Let's check all parenthesized contents
      parts = re.findall(r'\((.+?)\)', text)
      for part in parts:
          if part.strip() in UNIT_SYMBOLS:
              return True

  return False


def _convert_paragraph_to_omml(paragraph, text: str) -> None:
  """
  Replace paragraph content with OMML math.
  """
  # Clear existing runs
  p = paragraph._p
  p.clear_content()
  
  # Create OMML structure
  # <m:oMathPara>
  #   <m:oMath>
  #     <m:r>
  #       <m:t>text</m:t>
  #     </m:r>
  #   </m:oMath>
  # </m:oMathPara>
  
  # Note: For table cells, we usually want inline math, but user asked for "display math".
  # However, inside a table cell, oMathPara might be too much. 
  # Let's try inserting oMath directly into the paragraph.
  
  oMath = OxmlElement('m:oMath')
  r = OxmlElement('m:r')
  rPr = OxmlElement('m:rPr') # Math run properties
  
  # Set font to Cambria Math if possible, but usually automatic.
  # Let's just add text.
  
  t = OxmlElement('m:t')
  t.text = text
  
  r.append(rPr)
  r.append(t)
  oMath.append(r)
  
  p.append(oMath)


def patch_template(doc: DocxTemplate, context: dict) -> None:
  """
  Patch the template in-memory to replace complex filter chains with simple variables.
  This avoids issues where docxtpl/Jinja2 escapes RichText objects returned by filters.
  """
  docx_obj = doc.get_docx()
  if not docx_obj:
    print("[WARN] Could not get docx object for patching", file=sys.stderr)
    return

  # Replacements map: old_tag -> new_tag
  replacements = {
    "{{ consideration.units | consideration_units | nl2br }}": "{{ consideration_units_rt }}",
    "{{ consideration.units | consideration_units }}": "{{ consideration_units_rt }}",
    "{{ consideration | reference_lines | nl2br }}": "{{ references_rt }}",
    "{{ consideration | reference_lines }}": "{{ references_rt }}",
  }

  def patch_paragraphs(paragraphs):
    for p in paragraphs:
      if "{{" in p.text:
        original = p.text
        modified = original
        for old, new in replacements.items():
          if old in modified:
            modified = modified.replace(old, new)
        
        if modified != original:
          print(f"[DEBUG] Patched template tag: '{original}' -> '{modified}'", file=sys.stderr)
          p.text = modified

  # Patch body paragraphs
  patch_paragraphs(docx_obj.paragraphs)

  # Patch table cells
  for t in docx_obj.tables:
    for row in t.rows:
      for cell in row.cells:
        patch_paragraphs(cell.paragraphs)


def render_report(payload: dict) -> bytes:
  """
  Render the report and return the DOCX bytes.
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
  
  # Pre-calculate RichText objects
  context["consideration_units_rt"] = create_consideration_units_rt(context.get("consideration", {}).get("units"))
  context["references_rt"] = create_reference_lines_rt(context.get("consideration", {}))
  
  # Patch the template to use these new variables
  patch_template(doc, context)

  context_with_images = inject_inline_images(doc, context)
  context_with_tables = inject_tables(doc, context_with_images)
  context_with_blocks = inject_blocks(doc, context_with_tables)
  env = build_jinja_env()
  doc.render(context_with_blocks, jinja_env=env)
  strip_openxml_artifacts(doc.docx)
  
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
      sys.stderr.write("output_path is required for CLI usage\n")
      return 2

  except Exception as exc:  # pragma: no cover
    sys.stderr.write(f"Failed to render DOCX with docxtpl: {exc}\n")
    sys.stderr.write(traceback.format_exc())
    return 3

  return 0


if __name__ == "__main__":
  sys.exit(main())
