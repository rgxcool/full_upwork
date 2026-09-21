import requests
import json

API = 'http://localhost:5010'
session = requests.Session()

def login(email, password):
    resp = session.post(f &nbsp;    return resp.json()

# Login as admin first
login('admin@mindful.se', 'Admin123!')  # This has a space issue in the email

# Actually let me fix the login
