import requests
import json

API = 'http://localhost:5010'
session = requests.Session()

def login(email, password):
    resp = session.post(f'{API}/api/auth/login', json={'email': email, 'password': password})
    return resp.json()

# Login as Teacher A (Stockholm scope)
login('teacherA@mindful.se', 'Teacher123!')

# Get students without any filter
resp = session.get(f'{API}/api/students')
students = json.loads(resp.text)
print(f"Teacher A sees {len(students)} students total")

# Now check: are any of these students from other municipalities?
# Let's check each student's municipality
for s in students:
    mun = s.get('municipality')
    print(f"  {s.get('name', '?')}: municipality={mun}")

# Try with a specific municipality filter
# The student listing should apply studentScopeFilter automatically
# But let me check if there's a way to filter

# Let me also check: what does the student model look like for students created with municipality
login('admin@mindful.se', 'Admin123!')
resp = session.get(f'{API}/api/students/6aad03af06baa44d8dde0474')  # Student One
s = json.loads(resp.text)
print(f"\nStudent One municipality: {s.get('municipality')}")

# Create a new student with Stockholm municipality
resp = session.post(f'{API}/api/student', json={
    'name': 'Test Student',
    'email': 'test@test.local',
    'personalNumber': '199001010001',
    'municipality': 'Stockholm',
    'education': [{'type': 'Course', 'courseCode': 'TEST', 'grade': ''}]
})
new_s = json.loads(resp.text)
print(f"\nNew student municipality: {new_s.get('municipality')}")

# Now check Teacher A's students again
login('teacherA@mindful.se', 'Teacher123!')
resp = session.get(f'{API}/api/students')
students = json.loads(resp.text)
print(f"\nTeacher A now sees {len(students)} students")
for s in students:
    mun = s.get('municipality')
    print(f"  {s.get('name', '?')}: municipality={mun}")
