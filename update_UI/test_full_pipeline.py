import sys
import json
import os
import subprocess
import asyncio

# Local imports
sys.path.append(os.path.join(os.getcwd(), "lib", "python"))
from generate_past_report_content import generate_report_content
from past_report_schemas import PastReportStructure

async def test_generation_and_rendering():
    skeleton_path = "extracted_skeleton.json"
    new_data_path = "mock_new_data.json"
    output_docx = "final_generated_report.docx"
    template_path = "templates/past_report_template.docx"
    
    print("1. Loading Skeleton and Mock Data...")
    with open(skeleton_path, "r") as f:
        skeleton_dict = json.load(f)
        skeleton = PastReportStructure(**skeleton_dict)
        
    with open(new_data_path, "r") as f:
        new_data = json.load(f)
        
    print("2. Generating Content (AI)...")
    final_structure = await generate_report_content(skeleton, new_data)
    final_json = final_structure.model_dump()
    
    # Prepare payload for renderer
    payload = {
        "template_path": template_path,
        "output_path": output_docx,
        "context": final_json
    }
    
    print("3. Rendering DOCX...")
    renderer_path = os.path.join("lib", "docx", "render_with_docxtpl.py")
    
    process = subprocess.Popen(
        ["python3", renderer_path],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )
    
    stdout, stderr = process.communicate(input=json.dumps(payload, default=str)) # default=str for any non-serializable objects
    
    if process.returncode != 0:
        print(f"Renderer failed with code {process.returncode}")
        print(stderr)
    else:
        print(f"Successfully generated {output_docx}")

if __name__ == "__main__":
    asyncio.run(test_generation_and_rendering())
