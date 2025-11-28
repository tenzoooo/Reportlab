import sys
import os
import json
import asyncio
from openai import AsyncOpenAI

# Local imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from past_report_schemas import PastReportStructure, ContentBlock

# Initialize OpenAI Client
client = AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o")

async def generate_block_content(block: ContentBlock, new_data: dict) -> str:
    """
    Generates content for a single block using LLM.
    """
    if block.type != "text":
        return block.content # For tables/figures, we might handle mapping differently later

    prompt = f"""
    You are writing a section of a scientific report.
    
    **Instruction (Style & Content):**
    {block.instruction}
    
    **New Experimental Data:**
    {json.dumps(new_data, ensure_ascii=False)}
    
    **Task:**
    Write the content for this block in Japanese, strictly following the instruction and using the new data.
    Do not include any markdown formatting or prefixes like "Content:". Just the text.
    """
    
    completion = await client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": "You are a helpful assistant writing a report."},
            {"role": "user", "content": prompt}
        ]
    )
    
    return completion.choices[0].message.content.strip()

async def generate_report_content(skeleton: PastReportStructure, new_data: dict) -> PastReportStructure:
    """
    Iterates through the skeleton and generates content for each block.
    """
    # Create a deep copy or just modify in place (Pydantic models are mutable)
    # We'll modify in place for simplicity
    
    # Update Chapter Title if provided in new data
    if "experiment_title" in new_data:
        skeleton.chapter_title = new_data["experiment_title"]

    for section in skeleton.sections:
        for subsection in section.subsections:
            for block in subsection.content_blocks:
                if block.type == "text":
                    print(f"Generating content for block: {block.instruction[:30]}...")
                    generated_text = await generate_block_content(block, new_data)
                    block.content = generated_text
                elif block.type == "table":
                    # Simple mapping logic for mock data
                    # In real app, we'd match by label or order
                    if new_data.get("tables"):
                        block.content = new_data["tables"][0] # Just take the first table for now
                elif block.type == "figure":
                    if new_data.get("figures"):
                        # In real app, this would be an image object
                        # For now, just putting the description/caption
                        block.content = new_data["figures"][0]

    return skeleton

async def main_async():
    if len(sys.argv) < 3:
        print("Usage: python3 generate_past_report_content.py <skeleton_json_path> <new_data_json_path>")
        sys.exit(1)
    
    skeleton_path = sys.argv[1]
    new_data_path = sys.argv[2]
    
    try:
        with open(skeleton_path, "r") as f:
            skeleton_dict = json.load(f)
            skeleton = PastReportStructure(**skeleton_dict)
            
        with open(new_data_path, "r") as f:
            new_data = json.load(f)
            
        final_structure = await generate_report_content(skeleton, new_data)
        print(json.dumps(final_structure.model_dump(), indent=2, ensure_ascii=False))
        
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)

def main():
    asyncio.run(main_async())

if __name__ == "__main__":
    main()
