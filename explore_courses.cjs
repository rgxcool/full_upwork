import requests
import json

API = 'http://localhost:5010'

# Login
resp = requests.post(f'{API}/api/auth/login', json={'email': 'admin@mindful.se', 'password': 'Admin123!'})
cookies = resp.headers.get('set-cookie', '').split(';')[0] + '; ' + resp.headers.get('set-cookie', '')[1:] if resp.headers.get('set-cookie') else ''

# Check course-instances
print("=== Course Instances ===")
resp = requests.get(f'{API}/api/course-instances', headers={'Cookie': cookies})
instances = resp.json()
print(f"Count: {len(instances)}")
for inst in instances[:3]:
    print(f"  ID: {inst['_id'][:8]}")
    main_course = inst.get('mainCourseId', {})
    print(f"    mainCourseId: {main_course}")
    print(f"    mainCourseId.courseName: {main_course.get('courseName') if main_course else 'N/A'}")
    print(f"    mainCourseId.coursePoints: {main_course.get('coursePoints') if main_course else 'N/A'}")

# Check course-templates
print("\n=== Course Templates ===")
resp = requests.get(f'{API}/api/course-templates', headers={'Cookie': cookies})
templates = resp.json()
print(f"Count: {len(templates)}")
for tmpl in templates[:3]:
    print(f"  ID: {tmpl['_id'][:8]}")
    course_id = tmpl.get('courseId', {})
    print(f"    courseId: {course_id}")
    print(f"    courseId.courseName: {course_id.get('courseName') if course_id else 'N/A'}")
    print(f"    courseId.coursePoints: {course_id.get('coursePoints') if course_id else 'N/A'}")

# Now check for NP-poäng / grade suggestion
print("\n=== Grade Catalogs ===")
resp = requests.get(f'{API}/api/grade-catalogs', headers={'Cookie': cookies})
catalogs = resp.json()
print(f"Count: {len(catalogs)}")
for cat in catalogs[:2]:
    print(f"  Title: {cat.get('title')}")
    print(f"  studentId: {cat.get('studentId')}")
