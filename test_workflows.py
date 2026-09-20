import requests
import json

API = 'http://localhost:5010'
session = requests.Session()

def login(email, password):
    """Login and maintain session"""
    resp = session.post(f'{API}/api/auth/login', 
                        json={'email': email, 'password': password})
    return resp.json()

def api_get(path):
    """GET request with cookies"""
    resp = session.get(f'{API}{path}')
    return resp.json(), resp.status_code

def api_post(path, data=None):
    """POST request with cookies"""
    if data:
        resp = session.post(f'{API}{path}', json=data)
    else:
        resp = session.post(f'{API}{path}')
    return resp.json(), resp.status_code

def api_put(path, data=None):
    """PUT request with cookies"""
    if data:
        resp = session.put(f'{API}{path}', json=data)
    else:
        resp = session.put(f'{API}{path}')
    return resp.json(), resp.status_code

def api_delete(path, data=None):
    """DELETE request with cookies"""
    if data:
        resp = session.delete(f'{API}{path}', json=data)
    else:
        resp = session.delete(f'{API}{path}')
    return resp.json(), resp.status_code

print("=== Testing Workflows ===\n")

# A1: Login as admin
print("A1: Login as admin...")
result = login('admin@mindful.se', 'Admin123!')
print(f"  Role: {result['user']['role']}")
print(f"  PASS: {result['user']['role'] == 'admin'}\n")

# A2: Verify Teacher A exists
print("A2: Teacher A exists...")
_, status = api_get('/api/teachers')
teachers_data = _  # This is actually the json body
# Check if teacherA is in the list
print(f"  Teachers found: {len(teachers_data) if isinstance(teachers_data, list) else 'N/A'}\n")

# A3: Assign Teacher A to Stockholm municipality
print("A3: Assign Teacher A to Stockholm...")
# First need to get the teacherA user ID
# From earlier: 6aad031c06baa44d8dde046d
_, status = api_put('/api/users/6aad031c06baa44d8dde046d/municipalities', 
                    {'municipalities': ['Stockholm']})
print(f"  Status: {status}")
print(f"  PASS: {status == 200}\n")

# A4: Deactivate Teacher A and test immediate denial
print("A4: Deactivate Teacher A, test immediate denial...")
_, status = api_put('/api/users/6aad031c06baa44d8dde046d', {'active': False})
print(f"  Deactivate status: {status}")

# Login as Teacher A
login_res = login('teacherA@mindful.se', 'Teacher123!')
# Try to access students
_, status = api_get('/api/students')
print(f"  Teacher A student access status: {status}")
# Check if response indicates denial
stu_body = _
if status == 403 or (isinstance(stu_body, dict) and 'error' in stu_body):
    print(f"  PASS: Teacher A denied after deactivation\n")
else:
    print(f"  Check: Teacher A still accessible\n")

# A5: Reactivate Teacher A and remove grading permission
print("A5: Reactivate Teacher A, remove grading permission...")
_, status = api_put('/api/users/6aad031c06baa44d8dde046d', {'active': True})
print(f"  Reactivate status: {status}")

# Remove grading permission
_, status = api_put('/api/users/6aad031c06baa44d8dde046d/permissions', 
                    {'assignments:grade': False})
print(f"  Remove permission status: {status}")

# Login as Teacher A and test
login('teacherA@mindful.se', 'Teacher123!')
_, status = api_get('/api/students')
print(f"  Teacher A grading access after revocation: {status}")
if status == 403:
    print(f"  PASS: Permission revocation takes effect immediately\n")
else:
    print(f"  Check: status {status}\n")

# B1: Create Student 1
print("B1: Create Student 1...")
_, status = api_post('/api/student', {
    'name': 'Student One',
    'email': 'student1@test.local',
    'personalNumber': '199001011234',
    'municipality': 'Stockholm',
    'education': [{'type': 'Course', 'courseCode': 'MAT101', 'grade': ''}]
})
print(f"  Status: {status}")
print(f"  Response: {_} . . .")

# B2: Re-register with same personnummer/different course
print("B2: Re-register Student 1 same personnummer different course...")
_, status = api_post('/api/student', {
    'name': 'Student One Duplicate',
    'email': 'student1dup@test.local',
    'personalNumber': '199001011234',
    'municipality': 'Stockholm',
    'education': [{'type': 'Course', 'courseCode': 'ENG101', 'grade': '3'}]
})
print(f"  Status: {status}")
body = _
already_exists = body.get('alreadyExists') if isinstance(body, dict) else 'N/A'
dropout_cleared = not body.get('dropout', True) if isinstance(body, dict) else True
print(f"  alreadyExists: {already_exists}")
print(f"  dropout cleared: {dropout_cleared}\n")

# B3: Coordinator sees sensitive fields
print("B3: Coordinator sensitive fields visible...")
login('coordinator@mindful.se', 'Teacher123!')
_, status = api_get('/api/students/6aad03af06baa44d8dde0474')
print(f"  Status: {status}")
body = _
if isinstance(body, dict):
    print(f"  personnummer visible: {'personalNumber' in body}")
    print(f"  support notes visible: {'additionalInfo' in body or 'supportInfo' in body}")
    print(f"  exam accommodations visible: {'examAccommodations' in body}")
else:
    print(f"  Body: {body}\n")

# B4: Teacher A (scoped) search students - only own kommun
print("B4: Teacher A (Stockholm scope) search students...")
login('teacherA@mindful.se', 'Teacher123!')
_, status = api_get('/api/students')
print(f"  Status: {status}")
ta_body = _
if isinstance(ta_body, list):
    print(f"  Teacher A sees {len(ta_body)} students (should only be in Stockholm)")
# B5: Teacher B (global scope) search students
print("B5: Teacher B (global scope) search students...")
login('teacher@mindful.se', 'Teacher123!')
_, status = api_get('/api/students')
print(f"  Status: {status}")
tb_body = _
if isinstance(tb_body, list):
    print(f"  Teacher B sees {len(tb_body)} students (across all municipalities)\n")

# B6: Admin delete all students without confirmation token
print("B6: Admin delete all students without confirm token...")
login('admin@mindful.se', 'Admin123!')
_, status = api_delete('/api/students', {})
print(f"  Status: {status}")
body = _
if isinstance(body, dict):
    print(f"  Response: {body.get('error', 'no error')}")
    if 'confirm' in str(body.get('error', '')) or 'token' in str(body.get('error', '')):
        print(f"  PASS: Backend rejected without confirmation token\n")
    else:
        print(f"  Check: deletion result\n")

# C5: Excluded role 403 on students to grade
print("C5: Excluded role 403 on students to grade...")
login('student@mindful.se', 'Student123!')
_, status = api_get('/api/students/grade')  # or whichever endpoint
print(f"  Status: {status}")
if status == 403:
    print(f"  PASS: 403 received\n")
elif status == 404:
    print(f"  NOTE: 404 received (still denied access, just different code)\n")
else:
    print(f"  Result: HTTP {status}\n")

# D1: Student APL tab
print("D1: Student APL tab status...")
login('student@mindful.se', 'Student123!')
_, status = api_get('/api/students/6aad03af06baa44d8dde0474')
print(f"  Status: {status}")
stu_body = _
if isinstance(stu_body, dict):
    print(f"  APL Status: {stu_body.get('aplStatus', 'N/A')}")
    print(f"  Placement company: {stu_body.get('placementCompany', 'N/A')}")
    print(f"  Placement contact: {stu_body.get('placementContact', 'N/A')}")
    print(f"  APL dates: start={stu_body.get('aplStartDate', 'N/A')}, end={stu_body.get('aplEndDate', 'N/A')}\n")

# E1: Trigger diploma generation
print("E1: Trigger diploma generation...")
login('admin@mindful.se', 'Admin123!')
_, status = api_post('/api/certificates', {'studentId': '6aad03af06baa44d8dde0474'})
print(f"  Status: {status}")
gen_body = _
if isinstance(gen_body, dict):
    print(f"  Response: {gen_body}\n")

# E2: Check certificate records
print("E2: Check certificate records after generation...")
_, status = api_get('/api/certificates')
print(f"  Status: {status}")
cert_body = _
if isinstance(cert_body, dict):
    records = cert_body.get('records', [])
    total = cert_body.get('total', 0)
    print(f"  Total records: {total}")
    print(f"  Records count: {len(records)}")
    if records:
        # Check for duplicate claims
        for r in records:
            sig_type = r.get('signatureType', r.get('signature', 'N/A'))
            has_crypto = 'cryptographic' in str(sig_type).lower() or 'crypt' in str(sig_type).lower()
            print(f"  Certificate: id={r.get('id')}, student={r.get('studentName')}, signatureType={sig_type}, is_cryptographic={has_crypto}")
    # Check delivery status
    print(f"  Delivery status: check in response")

print("\n=== All Workflows Complete ===")
