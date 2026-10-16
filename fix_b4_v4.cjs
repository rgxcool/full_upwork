import requests
import json

API = 'http://localhost:5010'
session = requests.Session()

def login(email, password):
    resp = session.post(f'{API}/api/auth/login', json={'email': email, 'password': password})
    return resp.json()

# Try updating student via /api/students/:id PUT
login('admin@mindful.se', 'Admin123!')

# Get a student ID
resp = session.get(f'{API}/api/students')
students = json.loads(resp.text)
sid = students[0]['_id']
print(f"Trying to update student {students[0]['name']} with ID {sid}")

# Try different endpoint formats
resp = session.put(f'{API}/api/students/{sid}', json={'municipality': {'type': 'Stockholm'}})
print(f"/api/students/:id PUT: {resp.status_code} {resp.text[:100]}")

# Try /student/:id
resp2 = session.put(f'{API}/student/{sid}', json={'municipality': {'type': 'Stockholm'}})
print(f"/student/:id PUT: {resp2.status_code} {resp2.text[:100]}")
