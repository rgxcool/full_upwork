import requests
import json

API = 'http://localhost:5010'
resp = requests.post(f'{API}/api/auth/login', json={'email': 'admin@mindful.se', 'password': 'Admin123!'})
cookies = resp.headers.get('set-cookie', '').split(';')[0]

# Try student detail with populate
resp = requests.get(f'{API}/api/students?populate=education', headers={'Cookie': cookies})
students = resp.json()
print(f"Students with populate: {len(students)}")

# Check first student's education
if students:
    s = students[0]
    print(f"First student education: {json.dumps(s.get('education', []), default=str)[:200]}")
    print(f"First student _id: {s.get('_id')}")
    
    # Try to get detailed student
    sid = s['_id']
    resp2 = requests.get(f'{API}/api/students/{sid}', headers={'Cookie': cookies})
    print(f"\n/students/:id: status={resp2.status_code}")
    if resp2.status_code == 200:
        print(f"  body: {resp2.text[:200]}")
    else:
        print(f"  body: {resp2.text[:200]}")
