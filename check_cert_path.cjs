import requests
import json

API = 'http://localhost:5010'
resp = requests.post(f'{API}/api/auth/login', json={'email': 'admin@mindful.se', 'password': 'Admin123!'})
cookies = resp.headers.get('set-cookie', '').split(';')[0]

# Check various certificate paths
cert_paths = [
    '/api/certificates',
    '/api/certificates/',
    '/api/diplomas',
    '/api/diplomas/',
    '/api/graduations',
    '/api/graduations/',
    '/api/diploma',
    '/api/diploma/',
]

for path in cert_paths:
    resp = requests.post(f'{API}{path}', json={'studentId': '6aad03af06baa44d8dde0474'}, headers={'Cookie': cookies})
    print(f"{path}: status={resp.status_code} - {resp.text[:100]}")
