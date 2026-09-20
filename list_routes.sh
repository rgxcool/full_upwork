#!/bin/bash
API="http://localhost:5010"

echo "=== API Routes Check ==="

# Try common routes related to the test
routes=(
    "/api/students"
    "/api/student"  
    "/api/apl"
    "/api/certificates"
    "/api/diploma"
    "/api/certificate"
    "/api/certificates"
)

for route in "${routes[@]}"; do
    result=$(curl -s -X GET "$API$route" -b /tmp/test_b_cookies.txt 2>&1 | head -1)
    echo "$route: ${result:0:100}"
done
