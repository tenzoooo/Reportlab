import sys
import json
import os
import subprocess
from pathlib import Path

# Add lib/python to path
sys.path.append(os.path.join(os.getcwd(), "lib", "python"))
from past_report_workflow import extract_structure_from_docx

def test_flow(input_docx, template_path, output_docx):
    print(f"Extracting structure from {input_docx}...")
    structure = extract_structure_from_docx(input_docx)
    
    # Convert Pydantic model to dict
    context = structure.model_dump()
    
    # Mock content generation:
    # The extraction already put the text into 'content_blocks'.
    # So we can just use the extracted structure as the context for rendering.
    # We just need to ensure the keys match what the template expects.
    # The template expects 'sections', which matches our schema.
    
    payload = {
        "template_path": template_path,
        "output_path": output_docx,
        "context": context
    }
    
    print("Rendering report...")
    # Call render_with_docxtpl.py
    renderer_path = os.path.join("lib", "docx", "render_with_docxtpl.py")
    
    process = subprocess.Popen(
        ["python3", renderer_path],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )
    
    stdout, stderr = process.communicate(input=json.dumps(payload))
    
    if process.returncode != 0:
        print(f"Renderer failed with code {process.returncode}")
        print(stderr)
    else:
        print(f"Successfully generated {output_docx}")

if __name__ == "__main__":
    input_docx = "/Users/tenzooo/Downloads/Reportlab/定義書一覧/4319013_梅澤ひかる_OPアンプの実験_2.docx"
    template_path = "templates/past_report_template.docx"
    output_docx = "test_output_past_report.docx"
    
    test_flow(input_docx, template_path, output_docx)
