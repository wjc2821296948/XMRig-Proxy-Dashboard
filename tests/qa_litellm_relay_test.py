import importlib.util
import json
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / ".github/qa/agent/litellm_relay.py"
SPEC = importlib.util.spec_from_file_location("qa_litellm_relay", SCRIPT)
RELAY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RELAY)


class LiteLLMRelayTests(unittest.TestCase):
    def test_pins_model_and_caps_output_tokens(self):
        payload = {
            "model": "attacker-selected-model",
            "messages": [{"role": "user", "content": "test"}],
            "max_tokens": 9000,
            "stream": True,
            "n": 4,
        }
        result = json.loads(RELAY.prepare_payload(
            "/v1/chat/completions", json.dumps(payload).encode(), "configured-model"
        ))
        self.assertEqual(result["model"], "configured-model")
        self.assertEqual(result["max_tokens"], RELAY.MAX_OUTPUT_TOKENS)
        self.assertEqual(result["stream"], False)
        self.assertEqual(result["n"], 1)

    def test_preserves_only_one_supported_token_limit_field(self):
        payload = {
            "messages": [{"role": "user", "content": "test"}],
            "max_completion_tokens": 512,
            "max_tokens": 8192,
        }
        result = json.loads(RELAY.prepare_payload(
            "/v1/chat/completions", json.dumps(payload).encode(), "configured-model"
        ))
        self.assertEqual(result["max_completion_tokens"], 512)
        self.assertNotIn("max_tokens", result)

    def test_rejects_every_endpoint_except_chat_completions(self):
        for path in ("/v1/models", "/v1/completions", "http://example.com/v1/chat/completions"):
            with self.subTest(path=path), self.assertRaisesRegex(RELAY.RelayError, "unsupported endpoint"):
                RELAY.prepare_payload(path, b'{"messages":[{"role":"user","content":"x"}]}', "model")

    def test_rejects_invalid_or_missing_messages(self):
        for raw in (b"not-json", b"{}", b'{"messages":[]}'):
            with self.subTest(raw=raw), self.assertRaises(RELAY.RelayError):
                RELAY.prepare_payload("/v1/chat/completions", raw, "model")

    def test_rejects_oversized_request_body(self):
        raw = b" " * (RELAY.MAX_REQUEST_BYTES + 1)
        with self.assertRaisesRegex(RELAY.RelayError, "request too large"):
            RELAY.prepare_payload("/v1/chat/completions", raw, "model")

    def test_request_budget_is_atomic_under_concurrent_calls(self):
        handler = RELAY.RelayHandler
        original_count = handler.request_count
        try:
            handler.request_count = RELAY.MAX_REQUESTS_PER_RUN - 7
            with ThreadPoolExecutor(max_workers=32) as pool:
                claimed = list(pool.map(lambda _index: handler.claim_request_slot(), range(64)))
            self.assertEqual(sum(claimed), 7)
            self.assertEqual(handler.request_count, RELAY.MAX_REQUESTS_PER_RUN)
        finally:
            handler.request_count = original_count

    def test_upstream_is_fixed_and_redirects_are_rejected(self):
        self.assertEqual(RELAY.UPSTREAM_URL, "https://litellm.lrate.top/v1/chat/completions")
        redirect = RELAY.NoRedirectHandler()
        self.assertIsNone(redirect.redirect_request(None, None, 302, "Found", {}, "https://attacker.invalid/"))


if __name__ == "__main__":
    unittest.main()
