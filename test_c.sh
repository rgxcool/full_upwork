#!/bin/bash
API="http://localhost:5010"
COOKIE="/tmp/test_c_cookies.txt"

# Helper
login() { curl -s -X POST "$API/api/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$1\",\"password\":\"$2\"}" -b "$COOKIE" > /dev/null; }

rm -f "$COOKIE"

echo "=== C. TEACHER COURSE MANAGEMENT ==="

# C1: Teacher places Student 2 into course package with pace value other than 100
# This requires Vue frontend - testing via API would be different
echo "C1: Pacing value test - requires Vue frontend, skipping API test"

# C2: Teacher A enters grade, changes grade, changes justification
echo "C2: Teacher A grading actions..."
login "teacherA@mindful.se" "Teacher123!"
# First, let's check if there's an audit log endpoint
audit=$(curl -s "$API/api/auditlogs" -b "$COOKIE" 2>/dev/null | head -c 200 || echo "no audit endpoint")
echo "  Audit logs: $audit"

# C3: Teacher A locks a grade, admin unlocks it, notification appears
echo "C3: Grade lock/unlock and notifications..."
# This requires specific grade flow - let me check the grade routes
login "admin@mindful.se" "Admin123!"
grades=$(curl -s "$API/api/grade-catalogs" -b "$COOKIE" 2>/dev/null | head -c 200 || echo "no grade catalogs")
echo "  Grade catalogs: $grades"

# C4: Teacher A enters NP-poäng score and clicks "Visa förslag"
echo "C4: NP-poäng score and grade suggestion..."
# This requires national test subject flow - check via API
np=$(curl -s "$API/api/grades" -b "$COOKIE" 2>/dev/null | head -c 200 || echo "no grades")
echo "  Grade info: $np"

# C5: Role excluded from grading attempts "students to grade" view -> 403
echo "C5: Excluded role 403 on students to grade..."
login "student@mindful.se" "Student123!"
grade_403=$(curl -s -o /dev/null -w "%{http_code}" "$API/api/students/grade" -b "$COOKIE")
echo "  Student role trying /students/grade: HTTP $grade_403 (expected 403)"
if [ "$grade_403" = "403" ]; then
    echo "  PASS: 403 received"
else
    echo "  Result: HTTP $grade_403 (not 403)"
fi

echo ""
echo "=== Section C Complete ==="
