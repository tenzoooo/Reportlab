from http.server import BaseHTTPRequestHandler
import json
import sys
import os

# Add the project root to sys.path so we can import from lib
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from lib.docx.render_with_docxtpl import render_report

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        
        try:
            payload = json.loads(post_data.decode('utf-8'))
            docx_bytes = render_report(payload)
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
            self.send_header('Content-Disposition', 'attachment; filename="generated_report.docx"')
            self.end_headers()
            self.wfile.write(docx_bytes)
            
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            error_msg = json.dumps({"error": str(e)})
            self.wfile.write(error_msg.encode('utf-8'))
