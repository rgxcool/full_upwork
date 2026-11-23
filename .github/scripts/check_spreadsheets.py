#!/usr/bin/env python3
"""Guard against committing spreadsheets with real personal data (#105).

Fails when
  1. a tracked spreadsheet (.xlsx/.xls/.ods/.csv) is not in
     .github/spreadsheet-allowlist.txt, or
  2. any tracked spreadsheet contains a number that could be a real
     personnummer: a valid date (samordningsnummer: day + 60) AND a correct
     Luhn check digit. Numbers born 1900 are allowed: they are the fakes made
     by backend/scripts/anonymizeStudentWorkbook.js. Placeholders such as
     20000101-1234 and phone numbers fail the checksum and pass.

Prints file names, counts and reasons only — never cell contents.
Standard library only. Usage (repo root): python3 .github/scripts/check_spreadsheets.py
"""
import datetime
import fnmatch
import re
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ALLOWLIST = ROOT / ".github" / "spreadsheet-allowlist.txt"
EXTENSIONS = (".xlsx", ".xls", ".ods", ".csv")
PERSONNUMMER = re.compile(r"\b(?:19|20)?\d{6}[-+]?\d{4}\b")


def tracked_spreadsheets():
    out = subprocess.run(["git", "ls-files", "-z"], cwd=ROOT, capture_output=True, check=True).stdout
    return [p for p in out.decode().split("\0") if p.lower().endswith(EXTENSIONS)]


def allowed_patterns():
    lines = ALLOWLIST.read_text(encoding="utf-8").splitlines()
    return [l.strip() for l in lines if l.strip() and not l.lstrip().startswith("#")]


def text_of(path: Path) -> str:
    if path.suffix.lower() == ".csv":
        return path.read_text(encoding="utf-8", errors="ignore")
    if path.suffix.lower() in (".xlsx", ".ods"):
        with zipfile.ZipFile(path) as z:
            xml = "".join(
                z.read(n).decode("utf-8", "ignore")
                for n in z.namelist()
                if n.endswith(".xml") and ("sharedStrings" in n or "/worksheets/" in n or n == "content.xml")
            )
        return " ".join(re.findall(r">([^<]+)<", xml))
    return ""  # legacy .xls: allow-list only


def luhn_ok(ten_digits: str) -> bool:
    """Luhn check on YYMMDDNNNC: weights 2,1,2,1,... on the first nine digits,
    sum the digits of each product; C = (10 - sum % 10) % 10."""
    total = 0
    for i, ch in enumerate(ten_digits[:9]):
        product = int(ch) * (2 if i % 2 == 0 else 1)
        total += product // 10 + product % 10
    return (10 - total % 10) % 10 == int(ten_digits[9])


def date_ok(century: str, yymmdd: str) -> bool:
    """Valid birth date; samordningsnummer add 60 to the day."""
    year, month, day = int(century + yymmdd[:2]), int(yymmdd[2:4]), int(yymmdd[4:6])
    if day > 60:
        day -= 60
    try:
        datetime.date(year, month, day)
        return True
    except ValueError:
        return False


def could_be_real(value: str) -> bool:
    """True when `value` passes the personnummer date and checksum rules and
    is not a born-1900 fake."""
    digits = value.replace("-", "").replace("+", "")
    if len(digits) == 12:
        if digits.startswith("1900"):
            return False
        centuries = [digits[:2]]
        digits = digits[2:]
    else:  # YYMMDD-NNNN: the century is unknown, so try both
        centuries = ["19", "20"]
    return luhn_ok(digits) and any(date_ok(c, digits[:6]) for c in centuries)


def main() -> int:
    problems = []
    patterns = allowed_patterns()
    for rel in tracked_spreadsheets():
        if not any(fnmatch.fnmatch(rel, p) for p in patterns):
            problems.append(f"{rel}: not in .github/spreadsheet-allowlist.txt")
            continue
        real_looking = [v for v in PERSONNUMMER.findall(text_of(ROOT / rel)) if could_be_real(v)]
        if real_looking:
            problems.append(f"{rel}: {len(real_looking)} numbers that could be real personnummer (valid date and check digit)")
    if problems:
        print("Spreadsheet guard failed (#105 — never commit real personal data):")
        for p in problems:
            print(f"  - {p}")
        print("Use backend/scripts/anonymizeStudentWorkbook.js for test data, or add a vetted file to the allow-list.")
        return 1
    print("Spreadsheet guard: ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
