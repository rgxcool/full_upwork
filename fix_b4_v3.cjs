import requests
import json

API = 'http://localhost:5010'
session = requests.Session()

def login(email, password):
    resp = session.post(f'{API}/api/auth/login', json={'email': email, 'password': password})
    return resp.json()

# Update students without municipality to have Stockholm
login('admin@mindful.se', 'Admin123!')

# Get all students
resp = session.get(f'{API}/api/students')
all_students = json.loads(resp.text)

for s in all_students:
    sid = s['_id']
    # Check if municipality is None/null
    mun = s.get('municipality')
    if mun is None:
        # Update student to have Stockholm municipality
        update_res = session.put(f'{API}/api/students/{sid}', 
                                 json={'municipality': {'type': 'Stockholm'}})
        print(f"Updated {s.get('name')}: {update_res.status_code}")
    else:
        print(f"{s.get('name')}: already has municipality={mun}")

# Now verify Teacher A filtering
print("\n--- Verifying Teacher A filtering ---")
login('teacherA@mindful.se', 'Teacher123!')
resp = session.get(f'{API}/api/students')
teacher_a_students = json.loads(resp.text)
print(f"Teacher A now sees {len(teacher_a_students)} students (should be only Stockholm)")

# Check how many have Stockholm municipality
stockholm_count = sum(1 for s in teacher_a_students if s.get('municipality', {}).get('type') == 'Stockholm')
print(f"Of those, {stockholm_count} have Stockholm municipality")

# Teacher B (global)
login('teacher@mindful.se', 'Teacher123!')
resp = session.get(f'{API}/api/students')
teacher_b_students = json.loads(resp.text)
print(f"Teacher B sees {len(teacher_b_students)} students (should be all)")

# Now test the filtering - Teacher A should only see Stockholm students
print("\n--- Testing filter: Teacher A should ONLY see Stockholm students ---")
# Get students with Stockholm municipality
resp = session.get(f'{API}/api/students?populate=municipality')
all_with_mun = json.loads(resp.text)
stockholm_students = [s for s in all_with_mun if s.get('municipality', {}).get('type') == 'Stockholm']
print(f"Total students with Stockholm municipality: {len(stockholm_students)}")
print(f"Teacher A should see exactly {len(stockholm_students)} students")
