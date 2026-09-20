import requests

API = 'http://localhost:5010'

# Test various student update paths
paths = [
    '/api/students/6aacfb56c7905969d3b1e1d5',
    '/api/students/6aacfb56c7905969d3b1e1d5',
    '/student/6aacfb56c7905969d3b1e1d5',
    '/api/student/6aacfb56c7905969d3b1e1d5',
]

for path in paths:
    resp = requests.put(f'{API}{path}', json={'municipality': {'type': 'Stockholm'}})
    print(f"{path}: {resp.status_code} {resp.text[:100]}")
