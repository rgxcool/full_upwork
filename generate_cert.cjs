import requests
import json

API = 'http://localhost:5010'
session = requests.Session()

def login(email, password):
    resp = session.post(f'{API}/api/auth/login', json={'email': email, 'password': password})
    return resp.json()

# E1: Diploma generation
print("=== E1: Diploma Generation ===")
login('admin@mindful.se', 'Admin123!')

# Get certificate candidates
resp = session.get(f'{API}/api/certificates/candidates')
candidates = resp.json()
print(f"Candidates: {len(candidates.get('candidates', []))}")

if candidates.get('candidates'):
    # Get the first candidate's record ID
    candidate = candidates['candidates'][0]
    print(f"First candidate: {candidate.get('studentName')}")
    print(f"  Type: {candidate.get('type')}")
    print(f"  Status: {candidate.get('status')}")
    print(f"  Fields: {list(candidate.keys())}")
    
    # Try to generate certificate
    # The ID might be the CertificateRecord ID
    record_id = candidate.get('_id') or candidate.get('id')
    print(f"  Record ID: {record_id}")
    
    if record_id:
        resp = session.post(f'{API}/api/certificates/{record_id}/generate')
        print(f"\nGenerate certificate: status={resp.status_code}")
        print(f"  body: {resp.text[:300]}")
else:
    print("No candidates found")
    
# Also check if we can generate for Student One
print("\n--- Trying Student One ---")
login('student@mindful.se', 'Student123!')
# Check the student's own records
resp = session.get(f'{API}/api/certificates/mine')
print(f"/api/certificates/mine (student): status={resp.status_code}")
if resp.status_code == 200:
    print(f"  body: {resp.text[:200]}")
