import requests
import json

API = 'http://localhost:5010'
session = requests.Session()

def login(email, password):
    resp = session.post(f'{API}/api/auth/login', json={'email': email, 'password': password})
    return resp.json()

login('admin@mindful.se', 'Admin123!')

resp = session.get(f'{API}/api/certificates/candidates')
candidates = resp.json()
print(f"Full candidate data:")
for c in candidates.get('candidates', []):
    print(f"\nCandidate: {c.get('studentName')}")
    print(f"  All keys: {list(c.keys())}")
    print(f"  enrollmentId: {c.get('enrollmentId')}")
    print(f"  studentId: {c.get('studentId')}")
    print(f"  courseInstanceId: {c.get('courseInstanceId')}")
    print(f"  certificateNumber: {c.get('certificateNumber')}")
