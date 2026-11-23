#!/usr/bin/env python3
"""Guard against committing spreadsheets with real personal data (#105).

Fails when
  1. a tracked spreadsheet (.xlsx/.xls/.ods/.csv) is not in
     .github/spreadsheet-allowlist.txt, or
  2. any tracked spreadsheet contains a personnummer that is not an obvious
     fake: born 1900 (backend/scripts/anonymizeStudentWorkbook.js) or a 01-01
     placeholder date such as 20000101-1234.

Prints file names, counts and reasons only — never cell contents.
Standard library only. Usage (repo root): python3 .github/scripts/check_spreadsheets.py
"""
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


def is_obvious_fake(value: str) -> bool:
    digits = value.replace("-", "").replace("+", "")
    if len(digits) == 10:  # YYMMDD-NNNN: assume 19xx for the check
        digits = "19" + digits
    return digits.startswith("1900") or digits[4:8] == "0101"


def main() -> int:
    problems = []
    patterns = allowed_patterns()
    for rel in tracked_spreadsheets():
        if not any(fnmatch.fnmatch(rel, p) for p in patterns):
            problems.append(f"{rel}: not in .github/spreadsheet-allowlist.txt")
            continue
        real_looking = [v for v in PERSONNUMMER.findall(text_of(ROOT / rel)) if not is_obvious_fake(v)]
        if real_looking:
            problems.append(f"{rel}: {len(real_looking)} personnummer that are not obvious fakes (born 1900 or 01-01)")
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
