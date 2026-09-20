import requests
import json

API = 'http://localhost:5010'
session = requests.Session()

def login(email, password):
    resp = session.post(f'{API}/api/auth/login', json={'email': email, 'password': password})
    return resp.json()

# A4: Check deactivation
print("=== Investigating A4: Teacher Deactivation ===")
login('admin@mindful.se', 'Admin123!')
print("Admin logged in")

# Deactivate Teacher A
resp = session.put(f'{API}/api/users/6aad031c06baa44d8dde046d', json={'active': False})
print(f"Deactivate response: {resp.status_code} {resp.text}")

# Now login as Teacher A
login_res = login('teacherA@mindful.se', 'Teacher123!')
print(f"Teacher A login: role={login_res['user']['role']}")

# Try to access students
resp = session.get(f'{API}/api/students')
print(f"Teacher A students access: {resp.status_code}")
print(f"Response: {resp.text[:200]}")

# Check the user model
resp = session.get(f'{API}/api/users/6aad031c06baa44d8dde046d')
print(f"User model: {resp.text[:300]}")

# A5: Check permission removal
print("\n=== Investigating A5: Permission Removal ===")
login('admin@mindful.se', 'Admin123!')
resp = session.put(f'{API}/api/users/6aad031c06baa44d8dde046d/permissions', json={'assignments:grade': False})
print(f"Remove permission response: {resp.status_code} {resp.text}")

# Login as Teacher A
login('teacherA@mindful.se', 'Teacher123!')
resp = session.get(f'{API}/api/students')
print(f"Teacher A students after permission revocation: {resp.status_code}")
print(f"Response: {resp.text[:200]}")

# Check if the refreshUserAuthorization is being triggered
# The gradeRoutes or studentRoutes should use the `can` middleware
print("\n=== Checking which endpoints use refreshUserAuthorization ===")
# Let's check the grade routes
login('admin@mindful.se', 'Admin123!')
resp = session.get(f'{API}/api/grades')
print(f"Grades endpoint: {resp.status_code} {resp.text[:200]}")
