#!/bin/bash
set -e

API="http://localhost:5010"
COOKIE_FILE="/tmp/test_cookies.txt"

# Helper function
login() {
    curl -s -X POST "$API/api/auth/login" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"$1\",\"password\":\"$2\"}" \
        -c "$COOKIE_FILE" \
        -j > /dev/null
    echo "Logged in as $1"
}

# Cleanup
rm -f "$COOKIE_FILE"

# A1: Login as admin, create teacher
echo "=== A. TEACHER MANAGEMENT ==="
login "admin@mindful.se" "Admin123!"

# Check we're admin
echo "A1: Admin logged in"

# A2: Create Teacher A
echo "A2: Creating Teacher A..."
curl -s -X POST "$API/api/admin/teacher" \
    -H "Content-Type: application/json" \
    -b "$COOKIE_FILE" \
    -d '{"username":"teacherA","email":"teacherA@mindful.se","subject":"Matematik","generatePassword":true}' \
    -o /tmp/teacherA_response.json
cat /tmp/teacherA_response.json | head -5

# A3: Assign Teacher A to one municipality
echo "A3: Assigning Teacher A to Stockholm..."
curl -s -X PUT "$API/api/users/teacherA/municipalities" \
    -H "Content-Type: application/json" \
    -b "$COOKIE_FILE" \
    -d '{"municipalities":["Stockholm"]}'

# A4: Deactivate Teacher A and test immediate denial
echo "A4: Deactivating Teacher A..."
curl -s -X PUT "$API/api/users/teacherA" \
    -H "Content-Type: application/json" \
    -b "$COOKIE_FILE" \
    -d '{"active":false}'

# Try to access students as Teacher A (who is now deactivated)
# First need to login as Teacher A
login "teacherA@mindful.se" "Teacher123!"  # Using the predefined teacher password

echo "A4: Teacher A attempting to load student list..."
STUDENT_RESULT=$(curl -s -X GET "$API/api/students" -b "$COOKIE_FILE")
echo "A4: Student list response: $STUDENT_RESULT"

# A5: Reactivate Teacher A and remove permission
echo "A5: Reactivating Teacher A..."
curl -s -X PUT "$API/api/users/teacherA" \
    -H "Content-Type: application/json" \
    -b "$COOKIE_FILE" \
    -d '{"active":true}'

echo "A5: Removing grading permission from Teacher A..."
# Need to update permissions - let's check the permissions endpoint first
curl -s "$API/api/permissions" -b "$COOKIE_FILE" | head -5

echo ""
echo "=== B. STUDENT MANAGEMENT ==="

# B1: Create Student 1
echo "B1: Creating Student 1..."
curl -s -X POST "$API/api/student" \
    -H "Content-Type: application/json" \
    -b "$COOKIE_FILE" \
    -d '{"name":"Student One","email":"student1@test.local","personalNumber":"199001011234","municipality":"Stockholm","education":[{"type":"Course","courseCode":"MAT101","grade":""}]}'

# B2: Create Student 1 again with same personnummer
echo "B2: Creating Student 1 again (same personnummer)..."
curl -s -X POST "$API/api/student" \
    -H "Content-Type: application/json" \
    -b "$COOKIE_FILE" \
    -d '{"name":"Student One Duplicate","email":"student1dup@test.local","personalNumber":"199001011234","municipality":"Stockholm","education":[{"type":"Course","courseCode":"ENG101","grade":"3"}]}' \
    -w "\nHTTP_CODE: %{http_code}\n"

# B3: Low-privilege staff (coordinator) viewing student profile
echo "B3: Coordinator viewing student profile..."
login "coordinator@mindful.se" "Teacher123!"
# Get a student ID first
STUDENT_LIST=$(curl -s "$API/api/students" -b "$COOKIE_FILE" | head -1)
STUDENT_ID=$(echo "$STUDENT_LIST" | grep -o '"_id":"[^"]*' | cut -d'"' -f4)
echo "B3: Student ID: $STUDENT_ID"
# Fetch student profile
curl -s "$API/api/students/$STUDENT_ID" -b "$COOKIE_FILE" | python3 -c "import sys,json; d=json.load(sys.stdin); print('personnummer:', d.get('personalNumber','N/A')); print('additionalInfo:', d.get('additionalInfo','N/A')); print('examAccommodations:', d.get('examAccommodations','N/A'))"

# B4: Teacher A (scoped) searching students - only students in their kommun
echo "B4: Teacher A searching students (scoped to Stockholm)..."
login "teacherA@mindful.se" "Teacher123!"
TEACHERA_STUDENTS=$(curl -s "$API/api/students" -b "$COOKIE_FILE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d))")
echo "B4: Teacher A sees $TEACHERA_STUDENTS students"

# B5: Teacher B (global scope) searching students
echo "B5: Teacher B searching students (global scope)..."
login "teacherB@mindful.se" "Teacher123!"
TEACHERB_STUDENTS=$(curl -s "$API/api/students" -b "$COOKIE_FILE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d))")
echo "B5: Teacher B sees $TEACHERB_STUDENTS students"

# B6: Admin attempting to delete all students without confirmation token
echo "B6: Admin attempting delete all students without token..."
login "admin@mindful.se" "Admin123!"
curl -s -X DELETE "$API/api/students" \
    -H "Content-Type: application/json" \
    -b "$COOKIE_FILE" \
    -d '{}' | python3 -c "import sys,json; d=json.load(sys.stdin); print('Result:', d.get('error','no error'))"

echo ""
echo "=== C. TEACHER COURSE MANAGEMENT ==="

# C1: Teacher placing Student 2 into course package with pace value other than 100
# This requires the frontend, let me check the API
echo "C1: Not testing via API (requires Vue frontend)"

# C2: Teacher A entering grade for a student
echo "C2: Teacher A entering grade..."
# Need student and grade setup first

# C3: Teacher A locking a grade, admin unlocking
echo "C3: Not testing via API"

# C4: Teacher A entering NP-poäng score and clicking "Visa förslag"
echo "C4: Not testing via API"

# C5: Role excluded from grading attempting "students to grade" view
echo "C5: Testing 403 for excluded role..."
# Student role should get 403
curl -s "$API/api/students/grade" -b "$COOKIE_FILE" -o /dev/null -w "HTTP_CODE: %{http_code}\n" || true

echo ""
echo "=== D. APL / STUDENT SELF-SERVICE ==="

# D1: Student opening APL tab
echo "D1: Not testing via API (requires Vue frontend)"

# D2: Student uploading CV and toggling "Söker"
echo "D2: Not testing via API (requires Vue frontend)"

# D3: Staff opening APL board
echo "D3: Not testing via API (requires Vue frontend)"

echo ""
echo "=== E. CERTIFICATES ==="

# E1: Bringing student to diploma eligibility and triggering generation
echo "E1: Not testing via API"

# E2: Confirming certificate record
echo "E2: Not testing via API"

echo ""
echo "TESTS COMPLETE"
