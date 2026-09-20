import requests
import json

API = 'http://localhost:5010'
session = requests.Session()

def login(email, password):
    resp = session.post(f'{API}/api/auth/login', json={'email': email, 'password': password})
    return resp.json()

# Login as Teacher A (Stockholm scope)
login('teacherA@mindful.se', 'Teacher123!')

# Get students
resp = session.get(f'{API}/api/students')
students = json.loads(resp.text)
print(f"Teacher A sees {len(students)} students")

# Check each student's municipality format
for s in students:
    mun = s.get('municipality')
    mun_type = type(mun).__name__ if mun else 'None'
    print(f"  {s.get('name', '?')[:10]}: municipality={mun_type} value={mun}")

# Now create a new student with proper municipality
login('admin@mindful.se', 'Admin123!')
resp = session.post(f'{API}/api/student', json={
    'name': 'Test Student Stockholm',
    'email': 'stockholm@test.local',
    'personalNumber': '199001010001',
    'municipality': {'type': 'Stockholm'},
    'education': [{'type': 'Course', 'courseCode': 'TEST', 'grade': ''}]
})
print(f"\nCreated new student: {resp.text[:100]}")

# Now check Teacher A's students again
login('teacherA@mindful.se', 'Teacher123!')
resp = session.get(f'{API}/api/students')
students = json.loads(resp.text)
print(f"\nTeacher A now sees {len(students)} students")
for s in students:
    mun = s.get('municipality')
    mun_str = str(mun)[:50] if mun else 'None'
    print(f"  {s.get('name', '?')[:10]}: municipality={mun_str}")
