import requests
import json

API = 'http://localhost:5010'
session = requests.Session()

def login(email, password):
    resp = session.post(f'{API}/api/auth/login', json={'email': email, 'password': password})
    return resp.json()

# D1: Student APL tab
print("=== D1: Student APL Tab ===")
login('student@mindful.se', 'Student123!')

# Try /api/apl/my
resp = session.get(f'{API}/api/apl/my')
print(f"/api/apl/my: status={resp.status_code}")
if resp.status_code == 200:
    print(f"  body: {resp.text[:300]}")
else:
    print(f"  body: {resp.text[:200]}")

# Also try listing APL records
login('teacherA@mindful.se', 'Teacher123!')
resp = session.get(f'{API}/api/apl/records', headers={'Cookie': session.headers.get('set-cookie', [''])[0].split(';')[0] + '=' + session.headers.get('set-cookie', [''])[1] if session.headers.get('set-cookie') else ''})
print(f"\n/api/apl/records (Teacher): status={resp.status_code}")
if resp.status_code == 200:
    print(f"  body: {resp.text[:300]}")
else:
    print(f"  body: {resp.text[:200]}")
