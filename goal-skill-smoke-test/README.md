# FizzBuzz Smoke-Test (Goal-Skill-Test)

Kleines FizzBuzz-CLI als Testgegenstand für den `goal-driven-work` Skill (Phase 0).

## CLI

```bash
python3 fizzbuzz.py N      # gibt FizzBuzz-Zeilen für 1..N aus
python3 fizzbuzz.py 15     # Beispiel
```

Fehlerfälle: fehlendes/ungültiges Argument oder `N < 1` → Exit-Code 2.

## Tests

```bash
python3 test_fizzbuzz.py   # 9 Checks, Exit 0 bei Erfolg, letzte Zeile: "ok - all 9 checks passed"
```