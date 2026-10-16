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
raw = resp.text
print(f"Raw response: {raw[:300]}")

# Parse
students = json.loads(raw)
print(f"Type of students: {type(students)}")
if isinstance(students, list):
    print(f"List length: {len(students)}")
    for i, s in enumerate(students):
        print(f"  Student {i}: type={type(s).__name__}, value={str(s)[:100]}")
elif isinstance(students, dict):
    print(f"Dict keys: {list(students.keys())[:10]}")
