from http.server import BaseHTTPRequestHandler
import asyncio
import base64
import json
import os
import sys
import tempfile

# Add project root to sys.path for imports
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from lib.python import optimized_workflow as ow


async def run_optimized_workflow(file_path: str) -> dict:
  full_text = await ow.extract_text_from_file(file_path)
  splitter = ow.SmartSplitter()
  contexts = splitter.split(full_text)

  summary_task = ow.generate_summary(contexts.full_text)
  methods_task = ow.extract_methods(contexts.method_text)
  discussion_task = ow.normalize_discussion(contexts.discussion_text)

  summary_res, methods_res, discussion_res = await asyncio.gather(
    summary_task,
    methods_task,
    discussion_task,
  )

  builder = ow.LabReportBuilder(chapter=5)
  structured_experiments = builder.build_experiments(methods_res.experiments)

  final_json_str = builder.assemble_final_json(
    summary=summary_res.summary,
    units=discussion_res.units,
    experiments=structured_experiments,
    refs=discussion_res.references,
  )

  return json.loads(final_json_str)


class handler(BaseHTTPRequestHandler):
  def do_POST(self):
    temp_path = None
    try:
      content_length = int(self.headers.get("Content-Length", "0"))
      body = self.rfile.read(content_length)
      payload = json.loads(body.decode("utf-8"))

      file_b64 = payload.get("file_base64")
      filename = payload.get("filename") or "upload.pdf"
      if not file_b64:
        raise ValueError("file_base64 is required")

      suffix = os.path.splitext(filename)[1] or ".pdf"
      with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(base64.b64decode(file_b64))
        temp_path = tmp.name

      result = asyncio.run(run_optimized_workflow(temp_path))

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
