#!/usr/bin/env python3
"""Verify one dedicated LiteLLM key can call its configured model without printing secrets."""
import json
import os
import sys
import urllib.error
import urllib.request
from urllib.parse import urlsplit

key = os.environ.get("LITELLM_API_KEY", "")
model = os.environ.get("LITELLM_MODEL", "")
base = os.environ.get("LITELLM_API_BASE", "https://litellm.lrate.top/v1").rstrip("/")
parsed = urlsplit(base)
if (parsed.scheme != "https" or parsed.hostname != "litellm.lrate.top"
        or parsed.port not in (None, 443) or parsed.username or parsed.password
        or parsed.path.rstrip("/") != "/v1" or parsed.query or parsed.fragment):
    raise SystemExit("LITELLM_API_BASE must be https://litellm.lrate.top/v1")
if not key or not model:
    raise SystemExit("The dedicated API key or model variable is missing.")

payload = json.dumps({
    "model": model,
    "temperature": 0,
    "max_tokens": 8,
    "messages": [{"role": "user", "content": "Reply with the exact text QA_KEY_OK."}],
}).encode("utf-8")
request = urllib.request.Request(
    "https://litellm.lrate.top/v1/chat/completions",
    data=payload,
    headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    method="POST",
)
try:
    with urllib.request.urlopen(request, timeout=45) as response:
        result = json.loads(response.read().decode("utf-8"))
except urllib.error.HTTPError as error:
    # Do not print request headers or the API key; the response body is omitted too.
    raise SystemExit(f"LiteLLM request failed with HTTP {error.code}.") from None
except Exception as error:
    raise SystemExit(f"LiteLLM request failed: {type(error).__name__}.") from None

if not isinstance(result.get("choices"), list) or not result["choices"]:
    raise SystemExit("LiteLLM returned no model choices.")
print(f"LiteLLM authentication and model access succeeded for configured model: {model}")
