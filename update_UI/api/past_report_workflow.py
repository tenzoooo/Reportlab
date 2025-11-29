from http.server import BaseHTTPRequestHandler
import asyncio
import base64
import json
import os
import sys
import tempfile

# Add project root to sys.path for imports
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from lib.python import past_report_workflow as pr


async def run_past_report(file_path: str) -> dict:
  text = pr.read_docx_text(file_path)
  structure = await pr.extract_hint_with_llm(text)
  return structure.model_dump()


class handler(BaseHTTPRequestHandler):
  def do_POST(self):
    temp_path = None
    try:
      content_length = int(self.headers.get("Content-Length", "0"))
      body = self.rfile.read(content_length)
      payload = json.loads(body.decode("utf-8"))

      file_b64 = payload.get("file_base64")
      filename = payload.get("filename") or "reference.docx"
      if not file_b64:
        raise ValueError("file_base64 is required")

      suffix = os.path.splitext(filename)[1] or ".docx"
      with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(base64.b64decode(file_b64))
        temp_path = tmp.name

      result = asyncio.run(run_past_report(temp_path))

      self.send_response(200)
      self.send_header("Content-Type", "application/json")
      self.end_headers()
      self.wfile.write(json.dumps(result).encode("utf-8"))
    except Exception as e:
      self.send_response(500)
      self.send_header("Content-Type", "application/json")
      self.end_headers()
      self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
    finally:
      if temp_path and os.path.exists(temp_path):
        os.remove(temp_path)
