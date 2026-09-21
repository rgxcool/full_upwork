import requests
import json

API = 'http://localhost:5010'
session = requests.Session()

def login(email, password):
    resp = session.post(f'{API}/api/auth/login', json={'email': email, 'password': password})
    return resp.json()

# C1: Pace value in course package
# Let me check the course package routes and endpoints
login('teacherA@mindful.se', 'Teacher123!')

# Check course package related endpoints
endpoints = [
    '/api/course-packages',
    '/api/course-packages?populate=*',
    '/api/course-instances',
]

for ep in endpoints:
    resp = session.get(f'{API}{ep}')
    print(f"{ep}: status={resp.status_code}, body={resp.text[:200]}")

# C4: NP-poäng and "Visa förslag" 
# Check grade-related endpoints
login('admin@mindful.se', 'Admin123!')
grade_endpoints = [
    '/api/grades',
    '/api/grade-catalogs',
    '/api/betygsskala',
]

for ep in grade_endpoints:
    resp = session.get(f'{API}{ep}')
    print(f"{ep}: status={resp.status_code}, body={resp.text[:200]}")
