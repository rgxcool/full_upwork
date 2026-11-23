"""Tests for check_spreadsheets.py (personnummer checksum rule).

Numbers that must be flagged are built at test time with a birth year in 2099,
so they can never belong to a real person (CLAUDE.md §4).
Run: python3 -m unittest discover -s .github/scripts -p "test_*.py"
"""
import unittest

from check_spreadsheets import could_be_real, date_ok, luhn_ok


def with_check_digit(nine: str) -> str:
    """Append the Luhn check digit to nine digits (YYMMDDNNN)."""
    for c in "0123456789":
        if luhn_ok(nine + c):
            return nine + c
    raise AssertionError("no check digit")


class LuhnTest(unittest.TestCase):
    def test_exactly_one_check_digit_fits(self):
        nine = "991231123"
        fits = [c for c in "0123456789" if luhn_ok(nine + c)]
        self.assertEqual(len(fits), 1)

    def test_known_checksum(self):
        # 9 9 1 2 3 1 1 2 3 x weights 2 1 2 1 2 1 2 1 2 = 18 9 2 2 6 1 2 2 6
        # -> digit sums 9+9+2+2+6+1+2+2+6 = 39 -> C = (10 - 9) % 10 = 1
        self.assertTrue(luhn_ok("9912311231"))
        self.assertFalse(luhn_ok("9912311234"))


class DateTest(unittest.TestCase):
    def test_dates(self):
        self.assertTrue(date_ok("20", "991231"))
        self.assertFalse(date_ok("20", "991331"))  # month 13
        self.assertFalse(date_ok("20", "990230"))  # 30 February
        self.assertTrue(date_ok("20", "991291"))   # samordningsnummer: day 31 + 60


class CouldBeRealTest(unittest.TestCase):
    def test_valid_date_and_checksum_is_flagged(self):
        ten = with_check_digit("991231123")
        self.assertTrue(could_be_real(f"20{ten[:6]}-{ten[6:]}"))
        self.assertTrue(could_be_real(f"20{ten}"))
        coordination = with_check_digit("991291123")
        self.assertTrue(could_be_real(f"20{coordination[:6]}-{coordination[6:]}"))

    def test_wrong_check_digit_passes(self):
        ten = with_check_digit("991231123")
        wrong = ten[:9] + str((int(ten[9]) + 1) % 10)
        self.assertFalse(could_be_real(f"20{wrong[:6]}-{wrong[6:]}"))

    def test_invalid_date_passes(self):
        ten = with_check_digit("991331123")  # month 13
        self.assertFalse(could_be_real(f"20{ten[:6]}-{ten[6:]}"))

    def test_born_1900_fakes_pass(self):
        ten = with_check_digit("000101123")
        self.assertFalse(could_be_real(f"1900{ten[2:6]}-{ten[6:]}"))

    def test_placeholders_and_phone_numbers_pass(self):
        self.assertFalse(could_be_real("20000101-1234"))  # template placeholder
        self.assertFalse(could_be_real("19000101-0000"))  # CLAUDE.md fake


if __name__ == "__main__":
    unittest.main()
