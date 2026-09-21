import requests
import json

API = 'http://localhost:5010'
session = requests.Session()

def login(email, password):
    resp = session.post(f'{API}/api/auth/login', json={'email': email, 'password': password})
    return resp.json()

login('admin@mindful.se', 'Admin123!')

# Try different user update paths
paths = [
    '/api/users/6aad031c06baa44d8dde046d',
    '/api/users/6aad031c06baa44d8dde046d',
    '/users/6aad031c06baa44d8dde046d',
]

for path in paths:
    resp = session.put(f'{API}{path}', json={'active': False})
    print(f"{path}: {resp.status_code} {resp.text[:100]}")
