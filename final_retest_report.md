# Re-test Report: A5, B4, C1, C4

Environment: backend http://localhost:5010 (live), MongoDB. Auth via `Authorization: Bearer <jwt>` (extracted from login cookie). All logins via real `POST /api/auth/login`.

User IDs (fetched, not from memory):
- ADMIN      `6aacfb54c7905969d3b1e1c9`
- TEACHER_A  `6aad031c06baa44d8dde046d` (roles ['teacher','admin'] — admin role is residue from an earlier setup session; municipalities `["Stockholm"]`)
- TEACHER_B  `6aacfb54c7905969d3b1e1cb` (roles ['teacher'], municipalities `[]` = global)

Teacher A password is the temp password `T(gBH6w;U4M|` (Teacher123! → 401).

---

## A5: Permission update — PASS (with a note on the "grades" key)

Request sent (exactly as specified in the task):
```
PUT /api/users/6aad031c06baa44d8dde046d/permissions
Authorization: Bearer <admin-jwt>
Body: {"permissions": {"grades": false}}
```
Response:
```
400
{"message":"Invalid permission key(s): grades. Valid keys: calendar_final_exam, search_content, search_users, statistics, manage_users_permissions, hierarchy_management, own_settings, add_municipalities_courses, course_templates"}
```
NOTE: The wrapped `{"permissions": {...}}` format is correct and works — `"grades"` is simply NOT one of the 9 permission feature keys this app defines (`backend/src/config/permissions.js`). It is a spec/app mismatch, not a payload-shape bug.

Re-run with a real feature key to prove the mechanism:
```
PUT /api/users/6aad031c06baa44d8dde046d/permissions
Authorization: Bearer <admin-jwt>
Body: {"permissions": {"statistics": false}}
```
Response:
```
200
{"message":"User permissions updated successfully.","user":{"_id":"6aad031c06baa44d8dde046d","email":"teacherA@mindful.se","permissions":{"statistics":false}}}
```
Denial confirmed — Teacher A attempts a statistics action:
```
GET /api/analytics/filters  (Bearer teacherA-jwt)
-> 403 {"message":"Forbidden: You do not have the required permission."}
```
Restored to defaults (`{"permissions": {}}`) → Teacher A analytics `200` again.

VERDICT: PASS. Wrapped payload works, response echoes `permissions.statistics=false`, denial is enforced. Only caveat: no such thing as a `grades` permission key in this app.

---

## B4: Municipality scoping — PASS

1. Confirmed BEFORE change via admin:
```
GET /api/users/6aad031c06baa44d8dde046d -> 200
municipalities = ["Stockholm"]   (was already set; no re-assign needed)
```

2. `GET /api/students` with Teacher A's OWN token → 200, total 2 students.

3. Every student's `municipality.type`, printed explicitly:
```
Student One Duplicate (6aad03af06baa44d8dde0474)  municipality.type='Stockholm'
Student Two           (6aad03af06baa44d8dde0475)  municipality.type='Stockholm'
```

4. 2/2 = 100% have `municipality.type === "Stockholm"`. Zero leaks. No flag.

5. Teacher B (global) `GET /api/students` → 200, total 5 students:
```
Anna Andersson  municipality.type=None
Berta Berg      municipality.type=None
Calle Carlsson  municipality.type=None
Doris Dahl      municipality.type=None
Erik Ek         municipality.type=None
```
Count 5 > 2 and includes non-Stockholm. (Teacher B takes the `teacherId` branch in `GET /students` since she has only the `teacher` role; Teacher A has an `admin` role so it takes the coordinator branch — both paths apply `studentScopeFilter`, which is what enforces the municipality filter.)

VERDICT: PASS. Scoping logic works exactly as intended.

---

## C1: Pace scaling — PASS

Real data used: student `6aad03af06baa44d8dde0474` (Stockholm), package `6aacfb56c7905969d3b1e220` (2 courses: SVASVE01, MATMAT01a). Auth: Teacher A bearer. Both requests:
```
POST /api/placement/preview
Body: {"studentId":"6aad03af06baa44d8dde0474","type":"package","packageId":"6aacfb56c7905969d3b1e220","startDate":"2026-09-01","pace":N}
```

| pace | status | SVASVE01 weeks | MATMAT01a weeks | totalWeeks |
|------|--------|----------------|-----------------|------------|
| 100  | 200    | 5              | 10              | 15         |
| 150  | 200    | 3.33           | 6.67            | 11         |

Ratio check: `3.33/5 = 0.667`, `6.67/10 = 0.667` — both match `paceFactor = 100/150 ≈ 0.667`. (totalWeeks 15→11 includes an extra ~1 week because the next course start snaps to the following Monday between sequential courses; the per-course `weeks` values scale exactly.)

VERDICT: PASS.

---

## C4: NP-poäng suggestion — PASS (after seeding; was a DATA gap, not a code bug)

- `GET /api/grading-scale/terms` (Teacher A) → 200 `["HT26","VT26"]`
- `GET /api/grading-scale?term=HT26` → 200: one doc `{term:"HT26", subject:"Matematik", scale:[]}`

The Suggest endpoint ran and behaved correctly against this:
```
GET /api/grading-scale/suggest?term=HT26&subject=Matematik&points=20
-> 200 {"grade":null,"hasScale":true}
```
`hasScale: true` but grade null for EVERY points value because the seeded GradingScale documents have an EMPTY `scale: []`. `gradeFromScale(points, [])` correctly returns null for an empty scale (`backend/src/utils/gradingScale.js:37-48`) — so this is a data gap. I seeded valid thresholds (noted per instructions) via the admin-only PUT:
```
PUT /api/grading-scale/6aacfb56c7905969d3b1e230
Body: {"term":"HT26","subject":"Matematik","scale":[
  {"min":90,"grade":"A"},{"min":75,"grade":"B"},{"min":60,"grade":"C"},
  {"min":45,"grade":"D"},{"min":30,"grade":"E"}]}
-> 200
```
After seeding:
```
suggest?term=HT26&subject=Matematik&points=10 -> 200 {"grade":null,"hasScale":true}   (below E)
suggest?term=HT26&subject=Matematik&points=35 -> 200 {"grade":"E","hasScale":true}
suggest?term=HT26&subject=Matematik&points=55 -> 200 {"grade":"D","hasScale":true}
suggest?term=HT26&subject=Matematik&points=80 -> 200 {"grade":"B","hasScale":true}
suggest?term=HT26&subject=Matematik&points=95 -> 200 {"grade":"A","hasScale":true}
```

VERDICT: PASS. The endpoint/code path is correct; the earlier PARTIAL was entirely empty seeded scale data (no `{min,grade}` rows).

---

## Summary
| Test | Verdict | Root cause of earlier PARTIAL |
|------|---------|-------------------------------|
| A5 Permission update | PASS | Payload shape (wrapped) now correct; `grades` is not a valid feature key (spec mismatch) |
| B4 Municipality scoping | PASS | Needed Teacher A's real temp-password login + own token; 100% Stockholm, Teacher B global higher |
| C1 Pace scaling | PASS | Needed a real student + package ID with real token; ratio 0.667 confirmed |
| C4 NP-poäng suggest | PASS | Data gap: seeded GradingScale had empty `scale:[]`; seeded thresholds, endpoint works |