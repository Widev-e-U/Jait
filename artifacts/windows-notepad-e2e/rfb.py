#!/usr/bin/env python3
"""Minimal raw-RFB VNC client: screenshots + input, pure stdlib.

Protocol notes (QEMU default pixel format):
  32bpp/24depth, big-endian, true-colour => wire bytes per pixel: R,G,B,0.
Usage:
  rfb.py shot  out.ppm
  rfb.py click x y [mask]     mask: 1=left 2=middle 4=right
  rfb.py key   <keysym> [down|up|click]
  rfb.py type  "<text>"
  rfb.py combo <sym1> <sym2> ...   press-and-release all held together
"""
import socket, struct, sys, time

HOST, PORT = "172.17.0.4", 5900

KEYSYM = {
    "win": 0xFFEB, "ctrl": 0xFFE3, "alt": 0xFFE9, "shift": 0xFFE1,
    "enter": 0xFF0D, "esc": 0xFF1B, "tab": 0xFF09, "space": 0x20,
    "backspace": 0xFF08, "del": 0xFFFF,
}


def recvn(s, n):
    buf = b""
    while len(buf) < n:
        c = s.recv(n - len(buf))
        if not c:
            raise EOFError
        buf += c
    return buf


def connect():
    s = socket.create_connection((HOST, PORT), timeout=30)
    s.settimeout(25)
    recvn(s, 12)                      # RFB 003.xxx banner
    s.sendall(b"RFB 003.008\n")
    nsec = recvn(s, 1)[0]
    sectypes = recvn(s, nsec)
    assert 1 in sectypes, f"no None auth: {sectypes}"
    s.sendall(b"\x01")
    assert recvn(s, 4) == b"\0\0\0\0", "auth failed"
    s.sendall(b"\x01")                # ClientInit: shared
    si = recvn(s, 24)
    w, h = struct.unpack(">HH", si[:4])
    name_len = struct.unpack(">I", si[20:24])[0]
    if name_len:
        recvn(s, name_len)            # consume desktop name
    return s, w, h                    # keep server default pixel format


def shot(s, w, h):
    s.sendall(struct.pack(">BBHHHH", 3, 0, 0, 0, w, h))   # full FBUpdate
    px = None
    for _ in range(200):
        mtype = recvn(s, 1)[0]
        if mtype == 0:
            recvn(s, 1)               # padding
            nr = struct.unpack(">H", recvn(s, 2))[0]
            px = bytearray()
            for _ in range(nr):
                rx, ry, rw, rh = struct.unpack(">HHHH", recvn(s, 8))
                enc = struct.unpack(">i", recvn(s, 4))[0]
                assert enc == 0, f"non-raw encoding {enc}"
                px += recvn(s, rw * rh * 4)
            if px:
                break
        elif mtype == 1:              # SetColourMapEntries
            recvn(s, 5)
            n = struct.unpack(">H", recvn(s, 2))[0]
            recvn(s, n * 6)
        elif mtype == 2:              # Bell
            pass
        else:
            raise SystemExit(f"unexpected msg {mtype}")
    return bytes(px)


def save_ppm(path, px, w, h):
    with open(path, "wb") as f:
        f.write(b"P6\n%d %d\n255\n" % (w, h))
        # default pf is big-endian 0x00RRGGBB -> bytes R,G,B,0
        f.write(bytes(b"".join(bytes((px[i], px[i+1], px[i+2]))
                               for i in range(0, len(px), 4))))


def key_event(s, sym, down):
    s.sendall(struct.pack(">BBxxI", 4, 1 if down else 0, sym))


def pointer(s, x, y, mask):
    s.sendall(struct.pack(">BBHH", 5, mask, x, y))


def click(s, x, y, button="left"):
    mask = {"left": 1, "middle": 2, "right": 4}[button]
    pointer(s, x, y, mask)
    time.sleep(0.05)
    pointer(s, x, y, 0)


def type_text(s, text, delay=0.04):
    for ch in text:
        sym = ord(ch)
        if sym > 0xFF:
            sym = KEYSYM.get(ch)
            if sym is None:
                print(f"skip {ch!r}")
                continue
        key_event(s, sym, True)
        key_event(s, sym, False)
        time.sleep(delay)


def main():
    mode = sys.argv[1]
    s, w, h = connect()
    if mode == "shot":
        px = shot(s, w, h)
        save_ppm(sys.argv[2], px, w, h)
        print(f"shot {w}x{h} -> {sys.argv[2]}")
    elif mode == "click":
        click(s, int(sys.argv[2]), int(sys.argv[3]),
              sys.argv[4] if len(sys.argv) > 4 else "left")
        print("clicked")
    elif mode == "key":
        name = sys.argv[2]
        ks = KEYSYM.get(name, None)
        if ks is None:
            ks = int(name, 0)
        key_event(s, ks, True)
        key_event(s, ks, False)
        print(f"key {name}={hex(ks)}")
    elif mode == "combo":
        syms = [KEYSYM.get(a) or int(a, 0) for a in sys.argv[2:]]
        for sy in syms:
            key_event(s, sy, True)
        for sy in reversed(syms):
            key_event(s, sy, False)
        print("combo", [hex(x) for x in syms])
    elif mode == "type":
        type_text(s, sys.argv[2])
        print("typed", repr(sys.argv[2]))
    s.close()


if __name__ == "__main__":
    main()