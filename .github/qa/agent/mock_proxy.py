#!/usr/bin/env python3
"""Local-only XMRig Proxy API fixture for AI browser exploration."""
from http.server import BaseHTTPRequestHandler, HTTPServer
import json

SUMMARY = {
    "worker_id": "qa-agent-worker",
    "version": "qa-fixture",
    "uptime": 3600,
    "workers": 2,
    "hashrate": {"total": [120000, 118000, 115000, 110000, 105000, 100000]},
    "miners": {"now": 2, "max": 4},
    "results": {"accepted": 1200, "rejected": 2, "invalid": 0, "expired": 0, "latency": 20, "hashes_total": 1000000, "avg_time": 1.2},
    "resources": {"memory": {"total": 1073741824, "free": 536870912, "resident_set_memory": 268435456}, "hardware_concurrency": 4, "load_average": [0.1, 0.1, 0.1]},
    "upstreams": {"ratio": 2, "active": 1, "sleep": 0, "error": 0, "total": 1},
}

class Handler(BaseHTTPRequestHandler):
    def _headers(self, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        self.end_headers()

    def do_OPTIONS(self):
        self._headers(204)

    def do_GET(self):
        if self.path == "/1/summary":
            self._headers()
            self.wfile.write(json.dumps(SUMMARY).encode())
        elif self.path == "/1/config":
            self._headers(404)
            self.wfile.write(b'{"error":"restricted"}')
        else:
            self._headers(404)
            self.wfile.write(b'{"error":"not found"}')

    def log_message(self, *_args):
        pass

if __name__ == "__main__":
    HTTPServer(("0.0.0.0", 18081), Handler).serve_forever()
