import requests
import json

API = 'http://localhost:5010'
session = requests.Session()

def login(email, password):
    resp = session.post(f'{API}/api/auth/login', json={'email': email, 'password': password})
    return resp.json()

# E1: Diploma generation with correct endpoint
print("=== E1: Diploma Generation ===")
login('admin@mindful.se', 'Admin123!')

# First, check certificate records
resp = session.get(f'{API}/api/certificates')
print(f"/api/certificates: status={resp.status_code} body={resp.text[:100]}")

# Try the generate endpoint
# Need a CertificateRecord ID - let's check what records exist
print("\nLooking for CertificateRecords...")
# The endpoint is /api/certificates/:id/generate
# Let me try with a known record or create one

# Actually, let me check the certificateRecordRoutes more carefully
print("\nCertificate record routes exist at /api/certificates/:id/generate")
print("This requires a CertificateRecord ID")

# Let me try generating with a dummy ID first to see the error
resp = session.post(f'{API}/api/certificates/6aacfb56c7905969d3b1e1d5/generate')
print(f"/api/certificates/6aacfb56c7905969d3b1e1d5/generate: status={resp.status_code} body={resp.text[:200]}")

# Or try without the ID part
resp2 = session.post(f'{API}/api/certificates/generate', json={'studentId': '6aad03af06baa44d8dde0474'})
print(f"/api/certificates/generate: status={resp2.status_code} body={resp2.text[:200]}")
