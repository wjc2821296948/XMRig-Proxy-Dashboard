#!/usr/bin/env python3
"""Answer external DNS questions with NXDOMAIN; never forward or log queries."""
import socketserver
import struct
import threading


def _skip_name(query: bytes, offset: int) -> int:
    cursor = offset
    resume_offset = None
    pointer_hops = 0
    expanded_length = 0
    while True:
        if cursor >= len(query):
            raise ValueError("truncated DNS name")
        label_length = query[cursor]
        if label_length & 0xC0 == 0xC0:
            if cursor + 1 >= len(query):
                raise ValueError("truncated DNS compression pointer")
            pointer = ((label_length & 0x3F) << 8) | query[cursor + 1]
            if pointer < 12 or pointer >= cursor:
                raise ValueError("invalid DNS compression pointer")
            if resume_offset is None:
                resume_offset = cursor + 2
            cursor = pointer
            pointer_hops += 1
            if pointer_hops > 16:
                raise ValueError("DNS compression pointer loop")
            continue
        if label_length & 0xC0:
            raise ValueError("unsupported DNS label encoding")
        cursor += 1
        if label_length == 0:
            return resume_offset if resume_offset is not None else cursor
        if cursor + label_length > len(query):
            raise ValueError("truncated DNS label")
        expanded_length += label_length + 1
        if expanded_length > 255:
            raise ValueError("DNS name exceeds 255 bytes")
        cursor += label_length


def nxdomain_response(query: bytes) -> bytes:
    if len(query) < 12:
        raise ValueError("truncated DNS header")
    question_count = struct.unpack("!H", query[4:6])[0]
    if not 1 <= question_count <= 16:
        raise ValueError("unsupported DNS question count")
    offset = 12
    questions = []
    for _ in range(question_count):
        start = offset
        offset = _skip_name(query, offset)
        if offset + 4 > len(query):
            raise ValueError("truncated DNS question")
        offset += 4
        questions.append(query[start:offset])
    question_section = b"".join(questions)
    # Echo every question, ignore EDNS/additional records, and never recurse.
    header = query[:2] + b"\x81\x03" + struct.pack("!HHHH", question_count, 0, 0, 0)
    return header + question_section


def formerr_response(query: bytes) -> bytes:
    identifier = query[:2].ljust(2, b"\x00")
    return identifier + b"\x81\x01" + struct.pack("!HHHH", 0, 0, 0, 0)


class UdpHandler(socketserver.BaseRequestHandler):
    def handle(self):
        query, sock = self.request
        try:
            response = nxdomain_response(query)
        except ValueError:
            response = formerr_response(query)
        sock.sendto(response, self.client_address)


class TcpHandler(socketserver.StreamRequestHandler):
    def handle(self):
        self.connection.settimeout(2)
        prefix = self.rfile.read(2)
        if len(prefix) != 2:
            return
        length = struct.unpack("!H", prefix)[0]
        query = self.rfile.read(length)
        try:
            response = nxdomain_response(query)
        except ValueError:
            response = formerr_response(query)
        self.wfile.write(struct.pack("!H", len(response)) + response)


class QuietUDPServer(socketserver.UDPServer):
    allow_reuse_address = True

    def handle_error(self, *_args):
        pass


class QuietTCPServer(socketserver.TCPServer):
    allow_reuse_address = True

    def handle_error(self, *_args):
        pass


def main():
    udp = QuietUDPServer(("0.0.0.0", 53), UdpHandler)
    tcp = QuietTCPServer(("0.0.0.0", 53), TcpHandler)
    threading.Thread(target=tcp.serve_forever, daemon=True).start()
    udp.serve_forever()


if __name__ == "__main__":
    main()
