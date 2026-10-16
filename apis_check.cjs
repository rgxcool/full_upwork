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

# Try various APL endpoints
apl_ends = [
    '/api/apl',
    '/api/apl/board', 
    '/api/apl/status',
    '/api/students/6aad03af06baa44d8dde0474',  # Student One
    '/api/student',
]

for ep in apl_ends:
    resp = session.get(f'{API}{ep}')
    print(f"{ep}: status={resp.status_code}", end="")
    if resp.status_code == 200:
        try:
            body = resp.json()
            # Show relevant keys
            if isinstance(body, dict):
                keys = list(body.keys())[:8]
                print(f" - keys: {keys}")
            elif isinstance(body, list):
                print(f" - items: {len(body)}")
        except:
            print()
    else:
        print(f" - {resp.text[:80]}")
    print()

# E1: Diploma generation
print("\n=== E1: Diploma Generation ===")
login('admin@mindful.se', 'Admin123!')

# Try diploma generation with enrollmentId
# First check what enrollment IDs exist
resp = session.get(f'{API}/api/students/6aad03af06baa44d8dde0474')
student = resp.json()
print(f"Student One enrollment IDs: check education field")
print(f"Student education: {json.dumps(student.get('education', [])[:2])}")

# Try certificate generation
resp = session.post(f'{API}/api/certificates', json={'studentId': '6aad03af06baa44d8dde0474', 'enrollmentId': 'test'})
print(f"/api/certificates with enrollmentId: status={resp.status_code} body={resp.text[:100]}")

# Try without enrollmentId
resp2 = session.post(f'{API}/api/certificates', json={'studentId': '6aad03af06baa44d8dde0474'})
print(f"/api/certificates without enrollmentId: status={resp2.status_code} body={resp2.text[:100]}")
