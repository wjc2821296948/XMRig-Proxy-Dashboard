import importlib.util
import struct
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / ".github/qa/agent/dns_sinkhole.py"
SPEC = importlib.util.spec_from_file_location("qa_dns_sinkhole", SCRIPT)
SINKHOLE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SINKHOLE)


def question_for(name):
    labels = b"".join(bytes([len(label)]) + label.encode() for label in name.split(".")) + b"\0"
    return labels + b"\x00\x01\x00\x01"


def query_for(name="example.com"):
    return b"\x12\x34\x01\x00\x00\x01\x00\x00\x00\x00\x00\x00" + question_for(name)


class DnsSinkholeTests(unittest.TestCase):
    def test_returns_nxdomain_without_forwarding_the_query(self):
        query = query_for("sensitive-data.example")
        response = SINKHOLE.nxdomain_response(query)
        self.assertEqual(response[:2], query[:2])
        self.assertEqual(struct.unpack("!H", response[2:4])[0] & 0x000F, 3)
        self.assertEqual(struct.unpack("!H", response[4:6])[0], 1)
        self.assertEqual(struct.unpack("!H", response[6:8])[0], 0)
        self.assertEqual(response[12:], query[12:])

    def test_returns_nxdomain_for_multi_question_and_edns_queries(self):
        q1 = question_for("example.com")
        q2 = question_for("example.net")
        opt = bytes.fromhex("00002904d0000080000000")
        header = b"\x12\x34\x01\x00" + struct.pack("!H", 2) + b"\x00\x00\x00\x00" + struct.pack("!H", 1)
        query = header + q1 + q2 + opt
        response = SINKHOLE.nxdomain_response(query)
        self.assertEqual(struct.unpack("!H", response[4:6])[0], 2)
        self.assertEqual(struct.unpack("!H", response[10:12])[0], 0)
        self.assertEqual(response[12:], q1 + q2)
        self.assertEqual(response[3] & 0x0F, 3)

    def test_supports_compressed_question_names(self):
        first = question_for("example.com")
        second = b"\xc0\x0c\x00\x1c\x00\x01"
        header = b"\x12\x34\x01\x00" + struct.pack("!H", 2) + b"\x00\x00\x00\x00\x00\x00"
        query = header + first + second
        response = SINKHOLE.nxdomain_response(query)
        self.assertEqual(response[3] & 0x0F, 3)
        self.assertEqual(struct.unpack("!H", response[4:6])[0], 2)
        self.assertEqual(response[12:], first + second)

    def test_rejects_truncated_queries(self):
        for query in (b"", b"\x12\x34", b"\x12\x34\x01\x00\x00\x01"):
            with self.subTest(query=query), self.assertRaises(ValueError):
                SINKHOLE.nxdomain_response(query)

    def test_malformed_compression_gets_formerr_instead_of_a_silent_drop(self):
        malformed = b"\x12\x34\x01\x00\x00\x01\x00\x00\x00\x00\x00\x00\xc0\x0c\x00\x01\x00\x01"
        with self.assertRaises(ValueError):
            SINKHOLE.nxdomain_response(malformed)
        response = SINKHOLE.formerr_response(malformed)
        self.assertEqual(response[:2], malformed[:2])
        self.assertEqual(response[3] & 0x0F, 1)
        self.assertEqual(struct.unpack("!H", response[4:6])[0], 0)


if __name__ == "__main__":
    unittest.main()
