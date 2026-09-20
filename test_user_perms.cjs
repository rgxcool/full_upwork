import requests
import json

API = 'http://localhost:5010'
session = requests.Session()

def login(email, password):
    resp = session.post(f'{API}/api/auth/login', json={'email': email, 'password': password})
    return resp.json()

login('admin@mindful.se', 'Admin123!')

# Try permissions with correct format
resp = session.put(f'{API}/api/users/6aad031c06baa44d8dde046d/permissions', 
                   json={'permissions': {'assignments:grade': False}})
print(f"Permissions: {resp.status_code} {resp.text[:200]}")

# Check user model after
resp = session.get(f'{API}/api/users/6aad031c06baa44d8dde046d')
print(f"User model: {resp.text[:300]}")
