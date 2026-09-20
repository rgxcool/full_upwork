import requests

API = 'http://localhost:5010'
resp = requests.post(f'{API}/api/auth/login', json={'email': 'admin@mindful.se', 'password': 'Admin123!'})
cookies = resp.headers.get('set-cookie', '').split(';')[0]

# Test various student-related routes
routes = [
    '/api/students',
    '/api/students/',
    '/student',
    '/student/',
    '/api/students?populate=*',
]

for route in routes:
    resp = requests.get(f'{API}{route}', headers={'Cookie': cookies})
    print(f"{route}: status={resp.status_code}", end="")
    if resp.status_code == 200:
        try:
            body = resp.json()
            if isinstance(body, dict):
                print(f" - keys: {list(body.keys())[:5]}")
            elif isinstance(body, list):
                print(f" - count: {len(body)}")
        except:
            pass
    print()
