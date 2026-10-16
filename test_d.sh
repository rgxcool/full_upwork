#!/bin/bash
API="http://localhost:5010"
COOKIE="/tmp/test_d_cookies.txt"

# Helper
login() { curl -s -X POST "$API/api/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$1\",\"password\":\"$2\"}" -b "$COOKIE" > /dev/null; }

rm -f "$COOKIE"

echo "=== D. APL / STUDENT SELF-SERVICE ==="

# D1: Student opens own APL tab - confirm status, placement company/contact, dates show real values
echo "D1: Student APL tab status..."
login "student@mindful.se" "Student123!"
# Get student profile to check APL status
stu=$(curl -s "$API/api/student" -b "$COOKIE" 2>/dev/null || echo "{}")
echo "  Student APL data: $(echo "$stu" | python3 -c "import sys,json; d=json.load(sys.stdin); print('aplStatus:', d.get('aplStatus','N/A'), 'aplStatusHistory:', d.get('aplStatusHistory','N/A'))" 2>/dev/null || echo "parse error")"

# Check if student has placement info
echo "  student.placementCompany: check via full student profile"
stu_full=$(curl -s "$API/api/students/6aad03af06baa44d8dde0474" -b "$COOKIE" 2>/dev/null || echo "{}")
echo "  Full student profile fetched: $(echo "$stu_full" | python3 -c "import sys,json; d=json.load(sys.stdin); print('has placement:', bool(d.get('placementCompany')), 'has contact:', bool(d.get('placementContact')))" 2>/dev/null || echo "parse error")"

# D2: Student uploads CV and toggles "Söker" (seeking) on
# This requires Vue frontend - file upload API
echo "D2: Student CV upload and seeking toggle - requires Vue frontend"

# D3: Staff opens APL board for student - confirm Söker badge matches and CV reflected
echo "D3: Staff APL board..."
login "teacherA@mindful.se" "Teacher123!"
apl_board=$(curl -s "$API/api/apl" -b "$COOKIE" 2>/dev/null | head -c 200 || echo "no apl endpoint")
echo "  APL board: $apl_board"

echo ""
echo "=== Section D Complete ==="
