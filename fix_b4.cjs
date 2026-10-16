import requests
import json

API = 'http://localhost:5010'
session = requests.Session()

def login(email, password):
    resp = session.post(f'{API}/api/auth/login', json={'email': email, 'password': password})
    return resp.json()

# First, let's verify Teacher A's municipality
login('admin@mindful.se', 'Admin123!')
# Check user model
resp = session.get(f'{API}/api/users/6aad031c06baa44d8dde046d')
user_data = json.loads(resp.text)
print(f"Teacher A municipalities: {user_data.get('municipalities')}")

# Now login as Teacher A and check which students they can see
login('teacherA@mindful.se', 'Teacher123!')
resp = session.get(f'{API}/api/students')
students = json.loads(resp.text)
print(f"Teacher A sees {len(students)} students")

# Check each student's municipality
for s in students[:5]:
    sid = s.get('_id', '')[:8]
    print(f"  Student: {s.get('name', 'N/A')}, personalNumber: {s.get('personalNumber', 'N/A')}, municipality: {s.get('municipality', 'N/A')}")

# Now check Teacher B (global scope)
login('teacher@mindful.se', 'Teacher123!')
resp = session.get(f'{API}/api/students')
students_b = json.loads(resp.text)
print(f"\nTeacher B sees {len(students_b)} students")

# Check the student scope filter logic
# The studentScopeFilter middleware should restrict based on user's municipalities
# Let's also check if there are students with Stockholm municipality
print("\nChecking all students' municipalities...")
login('admin@mindful.se', 'Admin123!')
resp = session.get(f'{API}/api/students')
all_students = json.loads(resp.text)
stockholm_count = 0
other_count = 0
for s in all_students:
    mun = s.get('municipality', {})
    if mun and mun.get('type') == 'Stockholm':
        stockholm_count += 1
    else:
        other_count += 1
print(f"Total students: {len(all_students)}")
print(f"Stockholm municipality: {stockholm_count}")
print(f"Other municipalities: {other_count}")
