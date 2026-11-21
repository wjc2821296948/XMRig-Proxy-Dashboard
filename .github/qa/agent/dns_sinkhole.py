#!/usr/bin/env python3
"""Answer external DNS questions with NXDOMAIN; never forward or log queries."""
import socketserver
import struct
import threading


def nxdomain_response(query: bytes) -> bytes:
    if len(query) < 17 or struct.unpack("!H", query[4:6])[0] != 1:
        raise ValueError("truncated DNS query")
    offset = 12
    while offset < len(query):
        label_length = query[offset]
        offset += 1
        if label_length == 0:
            break
        if label_length & 0xC0 or offset + label_length > len(query):
            raise ValueError("unsupported or malformed DNS name")
        offset += label_length
    else:
        raise ValueError("unterminated DNS name")
    if offset + 4 > len(query):
        raise ValueError("truncated DNS question")
    question = query[12:offset + 4]
    # QR=1, RD=1, RA=1, RCODE=NXDOMAIN; one echoed question, no answers.
    header = query[:2] + b"\x81\x03" + struct.pack("!HHHH", 1, 0, 0, 0)
    return header + question


class UdpHandler(socketserver.BaseRequestHandler):
    def handle(self):
        query, sock = self.request
        try:
            response = nxdomain_response(query)
        except ValueError:
            return
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
            return
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
