
import sys
import os

# Add the directory containing the library to the python path
sys.path.append(os.path.join(os.getcwd(), 'lib/docx'))

from docxtpl import DocxTemplate
from docx.oxml.ns import qn
from render_with_docxtpl import build_table_subdoc

def verify_cant_split():
    template_path = 'templates/template.docx'
    if not os.path.exists(template_path):
        print(f"Template not found: {template_path}")
        return

    doc = DocxTemplate(template_path)
    
    rows = [
        ["Header 1", "Header 2"],
        ["Cell 1", "Cell 2"]
    ]
    
    subdoc = build_table_subdoc(doc, rows)
    
    if not subdoc.tables:
        print("No tables found in subdoc")
        sys.exit(1)
        
    table = subdoc.tables[0]
    
    # Check cantSplit property on rows
    for i, row in enumerate(table.rows):
        tr = row._tr
        tr_pr = getattr(tr, "trPr", None)
        if tr_pr is None:
            print(f"FAIL: Row {i} has no trPr")
            sys.exit(1)
            
        cant_split = tr_pr.find(qn("w:cantSplit"))
        if cant_split is None:
            print(f"FAIL: Row {i} has no w:cantSplit")
            sys.exit(1)
            
    print("SUCCESS: All table rows have w:cantSplit property.")

if __name__ == "__main__":
    verify_cant_split()
