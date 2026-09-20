import requests
import json

API = 'http://localhost:5010'
session = requests.Session()

def login(email, password):
    resp = session.post(f'{API}/api/auth/login', json={'email': email, 'password': password})
    return resp.json()

login('admin@mindful.se', 'Admin123!')

# Try the permissions endpoint with correct format
# The earlier error said: "Invalid permission key(s): assignments:grade. Valid keys: calendar_final_exam, search_content, search_users, statistics, manage_users_permissions, hierarchy_management, own_settings, add_municipalities_courses"
# The valid keys are from PERMISSION_FEATURES

# Let me check what the correct format should be
resp = session.put(f'{API}/api/users/6aad031c06baa44d8dde046d/permissions', 
                   json={'permissions': {'own_settings': True}})
print(f"Permissions with 'permissions' wrapper: {resp.status_code} {resp.text[:200]}")

# Try another valid key
resp2 = session.put(f'{API}/api/users/6aad031c06baa44d8dde046d/permissions', 
                   json={'permissions': {'statistics': True}})
print(f"Permissions with statistics: {resp2.status_code} {resp2.text[:200]}")

# Check user model
resp3 = session.get(f'{API}/api/users/6aad031c06baa44d8dde046d')
user_data = json.loads(resp3.text)
print(f"User model permissions: {user_data.get('permissions', 'N/A')}")
