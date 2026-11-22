#!/usr/bin/env python3
"""Narrow, credential-holding relay for the isolated Browser Use container."""
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.error import HTTPError, URLError
from urllib.request import HTTPSHandler, HTTPRedirectHandler, ProxyHandler, Request, build_opener
import json
import os
import ssl
from threading import Lock

UPSTREAM_URL = "https://litellm.lrate.top/v1/chat/completions"
MAX_REQUEST_BYTES = 2 * 1024 * 1024
MAX_RESPONSE_BYTES = 8 * 1024 * 1024
MAX_REQUESTS_PER_RUN = 60
MAX_OUTPUT_TOKENS = 2048


class RelayError(ValueError):
    pass


def prepare_payload(path: str, raw_body: bytes, model: str) -> bytes:
    """Validate one chat-completion request and pin its destination/model/budget."""
    if path != "/v1/chat/completions":
        raise RelayError("unsupported endpoint")
    if len(raw_body) > MAX_REQUEST_BYTES:
        raise RelayError("request too large")
    try:
        payload = json.loads(raw_body)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RelayError("invalid JSON") from error
    if not isinstance(payload, dict) or not isinstance(payload.get("messages"), list) or not payload["messages"]:
        raise RelayError("messages are required")
    payload["model"] = model
    payload["stream"] = False
    payload.pop("stream_options", None)
    payload["n"] = 1
    token_field = "max_completion_tokens" if "max_completion_tokens" in payload else "max_tokens"
    requested = payload.get(token_field, MAX_OUTPUT_TOKENS)
    if not isinstance(requested, int) or isinstance(requested, bool) or requested < 1:
        requested = MAX_OUTPUT_TOKENS
    payload.pop("max_tokens" if token_field == "max_completion_tokens" else "max_completion_tokens", None)
    payload[token_field] = min(requested, MAX_OUTPUT_TOKENS)
    return json.dumps(payload, separators=(",", ":")).encode("utf-8")


class NoRedirectHandler(HTTPRedirectHandler):
    """Reject upstream redirects so the relay can never be redirected to another host."""
    def redirect_request(self, request, file_pointer, code, message, headers, new_url):
        return None


class RelayHandler(BaseHTTPRequestHandler):
    request_count = 0
    request_count_lock = Lock()
    opener = build_opener(ProxyHandler({}), HTTPSHandler(context=ssl.create_default_context()), NoRedirectHandler())

    @classmethod
    def claim_request_slot(cls) -> bool:
        """Atomically reserve one of the per-run upstream request slots."""
        with cls.request_count_lock:
            if cls.request_count >= MAX_REQUESTS_PER_RUN:
                return False
            cls.request_count += 1
            return True

    def respond(self, status: int, body: bytes, content_type: str = "application/json") -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/healthz":
            self.respond(200, b'{"status":"ok"}')
        else:
            self.respond(404, b'{"error":"not found"}')

    def do_POST(self):
        if self.path != "/v1/chat/completions":
            self.respond(404, b'{"error":"not found"}')
            return
        try:
            length = int(self.headers.get("Content-Length", "-1"))
        except ValueError:
            length = -1
        if length < 0 or length > MAX_REQUEST_BYTES:
            self.respond(413, b'{"error":"invalid or oversized request"}')
            return
        raw_body = self.rfile.read(length)
        try:
            payload = prepare_payload(self.path, raw_body, self.server.model)
        except RelayError as error:
            self.respond(400, json.dumps({"error": str(error)}).encode("utf-8"))
            return

        if not RelayHandler.claim_request_slot():
            self.respond(429, b'{"error":"QA model request limit reached"}')
            return

        request = Request(
            UPSTREAM_URL,
            data=payload,
            headers={
                "Authorization": f"Bearer {self.server.api_key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            method="POST",
        )
        try:
            with self.opener.open(request, timeout=90) as response:
                body = response.read(MAX_RESPONSE_BYTES + 1)
                if len(body) > MAX_RESPONSE_BYTES:
                    self.respond(502, b'{"error":"upstream response too large"}')
                    return
                content_type = response.headers.get("Content-Type", "application/json").split(";", 1)[0]
                self.respond(response.status, body, content_type)
        except (HTTPError, URLError, TimeoutError, OSError):
            # Never log upstream bodies, headers, request content, or credentials.
            self.respond(502, b'{"error":"fixed LiteLLM upstream request failed"}')

    def log_message(self, *_args):
        pass

    def log_error(self, *_args):
        pass


def main():
    api_key = os.environ.get("QA_EXPLORER_LITELLM_API_KEY", "")
    model = os.environ.get("QA_EXPLORER_MODEL", "")
    if not api_key or not model or len(model) > 128:
        raise SystemExit("Relay requires its dedicated LiteLLM key and configured model")
    server = HTTPServer(("0.0.0.0", 8080), RelayHandler)
    server.api_key = api_key
    server.model = model
    server.serve_forever()


if __name__ == "__main__":
    main()
