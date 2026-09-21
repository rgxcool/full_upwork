import requests

API = 'http://localhost:5010'
resp = requests.post(f'{API}/api/auth/login', json={'email': 'admin@mindful.se', 'password': 'Admin123!'})
cookies = resp.headers.get('set-cookie', '').split(';')[0]

# Check course-instances raw
resp = requests.get(f'{API}/api/course-instances', headers={'Cookie': cookies})
print("=== Course Instances RAW ===")
print(resp.text[:500])

# Check course-templates raw
resp2 = requests.get(f'{API}/api/course-templates', headers={'Cookie': cookies})
print("\n=== Course Templates RAW ===")
print(resp2.text[:500])
