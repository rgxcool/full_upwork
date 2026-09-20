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

# Print raw student data - just name and municipality field
for s in students:
    name = s.get('name', '?')
    mun = s.get('municipality', 'KEY_NOT_FOUND')
    print(f"  {name}: municipality={mun} (type: {type(mun).__name__ if mun else 'None'})")
