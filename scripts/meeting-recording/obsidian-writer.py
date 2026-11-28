"""Authenticated loopback writer for a mounted Obsidian Meetings directory."""
import argparse
import hmac
from http.server import BaseHTTPRequestHandler, HTTPServer
import os
from pathlib import Path
import re
from urllib.parse import unquote, urlsplit
from uuid import uuid4

NOTE_PATH = re.compile(r"/vault/Meetings/(\d{4}-\d{2}-\d{2} Meeting [0-9a-f-]{36}\.md)")
MAX_BYTES = 3 * 1024 * 1024


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--meetings-dir", type=Path, required=True)
    parser.add_argument("--token-file", type=Path, required=True)
    parser.add_argument("--port", type=int, default=18171)
    args = parser.parse_args()
    token = args.token_file.read_text().strip()
    if len(token) < 32 or not token.isascii():
        parser.error("Provide an ASCII bearer token of at least 32 characters")
    directory = os.open(args.meetings_dir, os.O_DIRECTORY | os.O_NOFOLLOW)
    auth_header = f"Bearer {token}".encode()

    class Handler(BaseHTTPRequestHandler):
        def setup(self):
            super().setup()
            self.connection.settimeout(20)

        def authenticated(self):
            if hmac.compare_digest(self.headers.get("Authorization", "").encode(), auth_header):
                return True
            self.send_error(401)
            return False

        def do_GET(self):
            if not self.authenticated():
                return
            if self.path != "/vault/Meetings/":
                self.send_error(404)
                return
            self.send_response(204)
            self.end_headers()

        def do_PUT(self):
            if not self.authenticated():
                return
            note = NOTE_PATH.fullmatch(unquote(urlsplit(self.path).path))
            if not note:
                self.send_error(404)
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                self.send_error(400)
                return
            if not 0 < length <= MAX_BYTES:
                self.send_error(413)
                return
            temp = f".jait-{uuid4()}.tmp"
            try:
                content = self.rfile.read(length)
                if len(content) != length:
                    self.send_error(400)
                    return
                with os.fdopen(os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o640, dir_fd=directory), "wb") as output:
                    output.write(content)
                    output.flush()
                    os.fsync(output.fileno())
                os.replace(temp, note.group(1), src_dir_fd=directory, dst_dir_fd=directory)
                os.fsync(directory)
            except OSError:
                self.send_error(500)
                return
            finally:
                try:
                    os.unlink(temp, dir_fd=directory)
                except FileNotFoundError:
                    pass
            self.send_response(204)
            self.end_headers()

    try:
        with HTTPServer(("127.0.0.1", args.port), Handler) as server:
            server.serve_forever()
    finally:
        os.close(directory)


if __name__ == "__main__":
    main()
