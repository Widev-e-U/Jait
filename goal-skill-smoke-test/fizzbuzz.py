#!/usr/bin/env python3
"""FizzBuzz CLI: prints FizzBuzz lines for 1..N. Usage: fizzbuzz.py N"""

import sys


def fizzbuzz_line(n: int) -> str:
    if n % 15 == 0:
        return "FizzBuzz"
    if n % 3 == 0:
        return "Fizz"
    if n % 5 == 0:
        return "Buzz"
    return str(n)


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("usage: fizzbuzz.py N", file=sys.stderr)
        return 2
    try:
        n = int(argv[1])
    except ValueError:
        print("error: N must be an integer", file=sys.stderr)
        return 2
    if n < 1:
        print("error: N must be >= 1", file=sys.stderr)
        return 2
    for i in range(1, n + 1):
        print(fizzbuzz_line(i))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))