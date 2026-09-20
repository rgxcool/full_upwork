import requests
import json

API = 'http://localhost:5010'
session = requests.Session()

def login(email, password):
    resp = session.post(f'{API}/api/auth/login', json={'email': email, 'password': password})
    return resp.json()

# Check certificate records
print("=== Certificate Records ===")
login('admin@mindful.se', 'Admin123!')

resp = session.get(f'{API}/api/certificates')
print(f"/api/certificates: status={resp.status_code} total={resp.json().get('total', 'N/A')}")

# Try to find certificate records via different means
# Check the certificateRecordRoutes
print("\nChecking certificate record routes...")
routes_to_check = [
    '/api/certificate-records',
    '/api/certificates/records',
]

for path in routes_to_check:
    resp = session.get(f'{API}{path}', headers={'Cookie': session.cookies.get('token', '')})
    print(f"{path}: status={resp.status_code} - {resp.text[:100]}")

# Try to list all certificate records 
print("\nTrying to find records...")
# The records might be embedded in other endpoints
resp = session.get(f'{API}/api/certificate-records', headers={'Cookie': session.cookies.get('token', '')})
print(f"/api/certificate-records: status={resp.status_code} - {resp.text[:200]}")
