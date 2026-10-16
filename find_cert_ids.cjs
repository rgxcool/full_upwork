import requests
import json

API = 'http://localhost:5010'
session = requests.Session()

def login(email, password):
    resp = session.post(f'{API}/api/auth/login', json={'email': email, 'password': password})
    return resp.json()

login('admin@mindful.se', 'Admin123!')

# Try to find CertificateRecords by querying the model
# Or check if there's a way to list them
print("Checking for CertificateRecords...")

# The candidates have enrollmentId referencing StudentEnrollment
# Let me try using the enrollmentId as the CertificateRecord ID
enrollment_id = '6aacfb56c7905969d3b1e219'
resp = session.post(f'{API}/api/certificates/{enrollment_id}/generate')
print(f"Using enrollmentId as CertificateRecord ID: status={resp.status_code}")
print(f"  body: {resp.text[:200]}")

# Or try with the studentId
student_id = '6aacfb56c7905969d3b1e1db'
resp2 = session.post(f'{API}/api/certificates/{student_id}/generate')
print(f"Using studentId as CertificateRecord ID: status={resp2.status_code}")
print(f"  body: {resp2.text[:200]}")
