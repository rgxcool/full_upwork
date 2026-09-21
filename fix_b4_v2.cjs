import requests
import json

API = 'http://localhost:5010'
session = requests.Session()

def login(email, password):
    resp = session.post(f'{API}/api/auth/login', json={'email': email, 'password': password})
    return resp.json()

# Let's check the student model municipality field
login('admin@mindful.se', 'Admin123!')
resp = session.get(f'{API}/api/students/6aad03af06baa44d8dde0474')  # Student One
student = json.loads(resp.text)
print(f"Student One municipality: {student.get('municipality')}")
print(f"Student One municipality type: {type(student.get('municipality'))}")

# Check what municipalityInScope does
# The issue might be that students were created without municipality, 
# or the filtering logic has a bug

# Let me check the student creation and see if we can re-create with proper municipality
# First, let me understand the municipality field format

# Check the municipalities config
print("\nChecking ALL_MUNICIPALITIES from code...")
# The municipalities are: Botkyrka, Danderyd, Göteborg, etc.

# Let's see if we can filter students by municipality via API
login('teacherA@mindful.se', 'Teacher123!')
resp = session.get(f'{API}/api/students?limit=500')
all_students = json.loads(resp.text)
print(f"\nAll students count: {len(all_students)}")

# Check municipality field more carefully
for s in all_students:
    mun = s.get('municipality')
    print(f"  {s.get('name', '?')[:10]}: municipality={mun}, type={type(mun).__name__ if mun else 'None'}")
