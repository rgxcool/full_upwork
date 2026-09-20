#!/bin/bash
API="http://localhost:5010"
COOKIE="/tmp/test_b_cookies.txt"

# A1: Create Student 1 (admin)
login() { curl -s -X POST "$API/api/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$1\",\"password\":\"$2\"}" -c "$COOKIE" > /dev/null; }

rm -f "$COOKIE"

echo "=== B. STUDENT MANAGEMENT ==="

# B1: Create Student 1
login "admin@mindful.se" "Admin123!"
echo "B1: Create Student 1..."
s1=$(curl -s -X POST "$API/api/student" -H "Content-Type: application/json" -b "$COOKIE" -d '{"name":"Student One","email":"student1@test.local","personalNumber":"199001011234","municipality":"Stockholm","education":[{"type":"Course","courseCode":"MAT101","grade":""}]}')
echo "  Result: $s1"

# B2: Re-register with same personnummer/different course
echo "B2: Re-register Student 1 same personnummer different course..."
s2=$(curl -s -X POST "$API/api/student" -H "Content-Type: application/json" -b "$COOKIE" -d '{"name":"Student One Duplicate","email":"student1dup@test.local","personalNumber":"199001011234","municipality":"Stockholm","education":[{"type":"Course","courseCode":"ENG101","grade":"3"}]}')
echo "  Response: $s2"
already=$(echo "$s2" | grep -o 'alreadyExists[^,]*' | head -1)
echo "  alreadyExists: $already"

# B3: Coordinator sees which sensitive fields
echo "B3: Coordinator student profile sensitive fields..."
login "coordinator@mindful.se" "Teacher123!"
# Need a student ID - use the first student from list
sid=$(curl -s "$API/api/students" -b "$COOKIE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['_id'])" 2>/dev/null || echo "")
if [ -n "$sid" ]; then
    prof=$(curl -s "$API/api/students/$sid" -b "$COOKIE")
    echo "  personnummer: $(echo "$prof" | grep -o 'personalNumber[^,]*' | head -1 | cut -d: -f2- || echo 'N/A')"
    echo "  support notes: $(echo "$prof" | grep -o 'additionalInfo[^,]*' | head -1 | cut -d: -f2- || echo 'N/A')"
    echo "  exam accommodations: $(echo "$prof" | grep -o 'examAccommodations[^,]*' | head -1 | cut -d: -f2- || echo 'N/A')"
fi

# B4: Teacher A (scoped) search students - only own kommun
echo "B4: Teacher A (Stockholm scope) search students..."
login "teacherA@mindful.se" "Teacher123!"
ta_count=$(curl -s "$API/api/students" -b "$COOKIE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d))" 2>/dev/null || echo "0")
echo "  Teacher A sees $ta_count students"

# B5: Teacher B (global) search students
echo "B5: Teacher B (global scope) search students..."
login "teacher@mindful.se" "Teacher123!"
tb_count=$(curl -s "$API/api/students" -b "$COOKIE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d))" 2>/dev/null || echo "0")
echo "  Teacher B sees $tb_count students"

# B6: Admin delete all students without confirmation token
echo "B6: Admin delete all students without confirm token..."
login "admin@mindful.se" "Admin123!"
del=$(curl -s -X DELETE "$API/api/students" -H "Content-Type: application/json" -b "$COOKIE" -d '{}')
echo "  Result: $del"
if echo "$del" | grep -qi "confirm\|token"; then
    echo "  Backend rejected without token - PASS"
else
    echo "  Check deletion guarding"
fi

echo ""
echo "=== Section B Complete ==="
