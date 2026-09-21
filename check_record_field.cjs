import requests
import json

API = 'http://localhost:5010'
session = requests.Session()

def login(email, password):
    resp = session.post(f'{API}/api/auth/login', json={'email': email, 'password': password})
    return resp.json()

login('admin@mindful.se', 'Admin123!')

resp = session.get(f'{API}/api/certificates/candidates')
candidates = resp.json()

if candidates.get('candidates'):
    c = candidates['candidates'][0]
    print(f"Record field: {c.get('record')}")
    print(f"Record type: {type(c.get('record'))}")
    if c.get('record'):
        print(f"Record value: {json.dumps(c['record'], default=str)[:500]}")
