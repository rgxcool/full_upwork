import requests
import json

API = 'http://localhost:5010'
resp = requests.post(f'{API}/api/auth/login', json={'email': 'admin@mindful.se', 'password': 'Admin123!'})
cookies = resp.headers.get('set-cookie', '').split(';')[0] + '; ' + resp.headers.get('set-cookie', '')[1:] if resp.headers.get('set-cookie') else ''

# Check course-instances
print("=== Course Instances ===")
resp = requests.get(f'{API}/api/course-instances', headers={'Cookie': cookies})
instances = resp.json()
print(f"Count: {len(instances)}")
for inst in instances:
    print(f"  ID: {inst['_id']}")
    main_course = inst.get('mainCourseId', {})
    course_name = main_course.get('courseName') if main_course else 'N/A'
    course_points = main_course.get('coursePoints') if main_course else 'N/A'
    print(f"    courseName: {course_name}, coursePoints: {course_points}")
    print(f"    responsibleTeacher: {inst.get('responsibleTeacher')}")
    print(f"    startDate: {inst.get('startDate')}")
    print(f"    endDate: {inst.get('endDate')}")

# Check course-templates
print("\n=== Course Templates ===")
resp = requests.get(f'{API}/api/course-templates', headers={'Cookie': cookies})
templates = resp.json()
print(f"Count: {len(templates)}")
for tmpl in templates:
    print(f"  ID: {tmpl['_id']}")
    course_id = tmpl.get('courseId', {})
    course_name = course_id.get('courseName') if course_id else 'N/A'
    course_points = course_id.get('coursePoints') if course_id else 'N/A'
    print(f"    courseName: {course_name}, coursePoints: {course_points}")
    print(f"    templateName: {tmpl.get('templateName')}")

# Now check grade catalogs for NP-poäng
print("\n=== Grade Catalogs ===")
resp = requests.get(f'{API}/api/grade-catalogs', headers={'Cookie': cookies})
catalogs = resp.json()
print(f"Count: {len(catalogs)}")
for cat in catalogs:
    print(f"  Title: {cat.get('title')}")
    print(f"  studentName: {cat.get('studentName')}")
    print(f"  filename: {cat.get('filename')}")
