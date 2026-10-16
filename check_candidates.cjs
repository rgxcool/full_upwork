import requests
import json

API = 'http://localhost:5010'
session = requests.Session()

def login(email, password):
    resp = session.post(f'{API}/api/auth/login', json={'email': email, 'password': password})
    return resp.json()

# Check certificate candidates
print("=== Certificate Candidates ===")
login('admin@mindful.se', 'Admin123!')

resp = session.get(f'{API}/api/certificates/candidates')
print(f"/api/certificates/candidates: status={resp.status_code}")
if resp.status_code == 200:
    data = resp.json()
    print(f"  candidates: {len(data.get('candidates', []))}")
    for c in data.get('candidates', [])[:3]:
        print(f"    - {c.get('studentName')}: type={c.get('type')}, status={c.get('status')}")
else:
    print(f"  body: {resp.text[:200]}")

# Also check eligible students
print("\n=== Eligible Students ===")
resp = session.get(f'{API}/api/certificates/eligible')
print(f"/api/certificates/eligible: status={resp.status_code}")
if resp.status_code == 200:
    data = resp.json()
    print(f"  eligible: {len(data.get('eligible', []))}")
    for e in data.get('eligible', [])[:3]:
        print(f"    - {e.get('studentName')}: aplStatus={e.get('aplStatus')}, courses={e.get('courseCount')}")
