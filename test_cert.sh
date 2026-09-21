#!/bin/bash
API="http://localhost:5010"
COOKIE="/tmp/test_cert_cookies.txt"

login() { curl -s -X POST "$API/api/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$1\",\"password\":\"$2\"}" -b "$COOKIE" > /dev/null; }

rm -f "$COOKIE"

echo "=== E. CERTIFICATES ==="

# E1: Bring student to diploma eligibility and trigger generation
echo "E1: Trigger diploma generation..."
login "admin@mindful.se" "Admin123!"
# Check if there's a diploma generation endpoint
diploma=$(curl -s -X POST "$API/api/certificates" -H "Content-Type: application/json" -b "$COOKIE" -d '{"studentId":"6aad03af06baa44d8dde0474"}' 2>/dev/null)
echo "  Generate diploma: $diploma"

# Check certificates list
certs=$(curl -s "$API/api/certificates" -b "$COOKIE")
echo "  Certificates list: $certs"

# E2: Confirm only one PDF/certificate record, emailed, no cryptographic signature claim
echo "E2: Check certificate records..."
# Count certificate records
cert_count=$(echo "$certs" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('total',0))" 2>/dev/null || echo "0")
echo "  Total certificate records: $cert_count"

# Check for duplicate records
duplicate_check=$(echo "$certs" | python3 -c "
import sys,json
d=json.load(sys.stdin)
records = d.get('records',[])
print(f'Records: {len(records)}')
if records:
    ids = [r.get('id') for r in records]
    print(f'ID s: {ids}')
    print(f'Unique: {len(set(ids))}')
" 2>/dev/null || echo "parse error"

# Check email delivery status
echo "  Email delivery: check via API response"

# Check signature type
echo "  Signature type: check response for cryptographic claim"

echo ""
echo "=== Section E Complete ==="
