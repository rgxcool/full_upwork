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

# Check each student's municipality format - handle both string and dict
for s in students:
    mun = s.get('municipality')
    if mun is None:
        print(f"  {s.get('name', '?')[:10]}: municipality=None")
    elif isinstance(mun, str):
        print(f"  {s.get('name', '?')[:10]}: municipality=STRING '{mun}'")
    elif isinstance(mun, dict):
        print(f"  {s.get('name', '?')[:10]}: municipality=DICT {mun}")
    else:
        print(f"  {s.get('name', '?')[:10]}: municipality={type(mun).__name__}={mun}")
