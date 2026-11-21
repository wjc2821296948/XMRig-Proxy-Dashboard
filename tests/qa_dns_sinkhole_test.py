import importlib.util
import struct
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / ".github/qa/agent/dns_sinkhole.py"
SPEC = importlib.util.spec_from_file_location("qa_dns_sinkhole", SCRIPT)
SINKHOLE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SINKHOLE)


def query_for(name="example.com"):
    labels = b"".join(bytes([len(label)]) + label.encode() for label in name.split(".")) + b"\0"
    return b"\x12\x34\x01\x00\x00\x01\x00\x00\x00\x00\x00\x00" + labels + b"\x00\x01\x00\x01"


class DnsSinkholeTests(unittest.TestCase):
    def test_returns_nxdomain_without_forwarding_the_query(self):
        query = query_for("sensitive-data.example")
        response = SINKHOLE.nxdomain_response(query)
        self.assertEqual(response[:2], query[:2])
        self.assertEqual(struct.unpack("!H", response[2:4])[0] & 0x000F, 3)
        self.assertEqual(struct.unpack("!H", response[4:6])[0], 1)
        self.assertEqual(struct.unpack("!H", response[6:8])[0], 0)
        self.assertEqual(response[12:], query[12:])

    def test_rejects_truncated_queries(self):
        for query in (b"", b"\x12\x34", b"\x12\x34\x01\x00\x00\x01"):
            with self.subTest(query=query), self.assertRaises(ValueError):
                SINKHOLE.nxdomain_response(query)

    def test_rejects_compressed_or_malformed_question_names(self):
        compressed = b"\x12\x34\x01\x00\x00\x01\x00\x00\x00\x00\x00\x00\xc0\x0c\x00\x01\x00\x01"
        with self.assertRaisesRegex(ValueError, "unsupported or malformed"):
            SINKHOLE.nxdomain_response(compressed)


if __name__ == "__main__":
    unittest.main()
