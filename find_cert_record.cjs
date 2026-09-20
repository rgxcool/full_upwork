import requests
import json

API = 'http://localhost:5010'
session = requests.Session()

def login(email, password):
    resp = session.post(f'{API}/api/auth/login', json={'email': email, 'password': password})
    return resp.json()

# Find CertificateRecords
print("=== Finding Certificate Records ===")
login('admin@mindful.se', 'Admin123!')

# Try to list records with different endpoints
routes = [
    '/api/certificate-records',
    '/api/certificates/records',
    '/api/records',
]

for path in routes:
    resp = session.get(f'{API}{path}', headers={'Cookie': session.cookies.get('token', '')})
    print(f"{path}: status={resp.status_code} - {resp.text[:100]}")

# Try to create a certificate record
# First, let me check the certificate model fields
print("\nChecking certificate model...")
# The candidate has: enrollmentId, studentId, studentName, personalNumber, courseInstanceId, courseId, courseName, packageName, startDate, endDate, completedAt, grade, eligible, etc.

# Let me try generating using the enrollmentId
print("\n--- Using enrollmentId to generate ---")
# The candidate has enrollmentId - let's try using that
# Actually, looking at the generate endpoint, it takes CertificateRecord ID, not enrollmentId
# But maybe we can find the CertificateRecord through the student

# Let me check student one's enrollments
login('student@mindful.se', 'Student123!')
resp = session.get(f'{API}/api/students/6aad03af06baa44d8dde0474')
student = resp.json()
print(f"Student One education: {json.dumps(student.get('education', []), default=str)[:500]}")

# Check enrollments
enrollment_ids = [e.get('_id') for e in student.get('education', []) if e.get('_id')]
print(f"\nEnrollment IDs: {enrollment_ids}")

# Try to generate using one of the enrollment IDs as the CertificateRecord ID
if enrollment_ids:
    enroll_id = enrollment_ids[0]
    print(f"\nTrying enrollment ID as CertificateRecord ID: {enroll_id}")
    resp = session.post(f'{API}/api/certificates/{enroll_id}/generate')
    print(f"status={resp.status_code} body={resp.text[:200]}")
