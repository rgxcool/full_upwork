import requests

API = 'http://localhost:5010'

# Try to find course-related routes
# First, let's login
resp = requests.post(f'{API}/api/auth/login', json={'email': 'admin@mindful.se', 'password': 'Admin123!'})
cookies = resp.headers.get('set-cookie', '').split(';')[0].split('=')[0] + '=' + resp.headers.get('set-cookie', '').split(';')[0].split('=')[1]

# Try various course-related paths
paths = [
    '/api/course-packages',
    '/api/course-packages/',
    '/api/course-instances',
    '/api/course-instances/',
    '/api/course-templates',
    '/api/course-templates/',
    '/api/betygsskala',
    '/api/utvardering',
    '/api/larande',
]

for path in paths:
    resp = requests.get(f'{API}{path}', headers={'Cookie': cookies.split(';')[0]})
    status = resp.status_code
    body_prefix = resp.text[:100].replace('\\n', ' ')
    print(f"{path}: {status} - {body_prefix}")
