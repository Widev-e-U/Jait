#!/usr/bin/env python3
"""Self-tests for fizzbuzz.py. Usage: test_fizzbuzz.py"""

import subprocess
import sys
from pathlib import Path

CLI = Path(__file__).with_name("fizzbuzz.py")

checks = []


def check(name: str, cond: bool, detail: str = ""):
    checks.append((name, cond, detail))
    print(("ok   - " if cond else "FAIL - ") + name + (f" ({detail})" if detail and not cond else ""))


def run(*args: str):
    return subprocess.run([sys.executable, str(CLI), *args], capture_output=True, text=True)


# 1: plain numbers
check("1 -> '1'", run("1").stdout == "1\n")
# 2: Fizz
check("3 -> 'Fizz'", run("3").stdout == "1\n2\nFizz\n")
# 3: Buzz
check("5 -> 'Buzz'", run("5").stdout == "1\n2\nFizz\n4\nBuzz\n")
# 4: FizzBuzz
check("15 ends with FizzBuzz", run("15").stdout.splitlines()[-1] == "FizzBuzz")
# 5: no FizzBuzz before 15
check("no FizzBuzz in 1..14", "FizzBuzz" not in run("14").stdout)
# 6: line count matches N
check("line count == N for N=9", len(run("9").stdout.splitlines()) == 9)
# 7: every 3rd non-15 line is Fizz
out = run("15").stdout.splitlines()
check("positions 3,6,9,12 are Fizz", all(out[i - 1] == "Fizz" for i in (3, 6, 9, 12)))
# 8: usage error exit code
check("no args -> exit 2", run().returncode == 2)
# 9: negative input rejected
check("N=0 -> exit 2", run("0").returncode == 2)

failed = [c for c in checks if not c[1]]
print(f"ok - all {len(checks)} checks passed" if not failed else f"FAILED: {len(failed)} of {len(checks)}")
sys.exit(0 if not failed else 1)