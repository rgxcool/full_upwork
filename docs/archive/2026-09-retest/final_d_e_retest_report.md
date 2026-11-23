# Re-test Report: Sections D (APL) and E (Certificates)

Env: backend http://localhost:5010, auth via `Authorization: Bearer <jwt>` from a real `POST /api/auth/login`.
Users: ADMIN `6aacfb54c7905969d3b1e1c9`, STAFF teacher@mindful.se `6aacfb54c7905969d3b1e1cb`, STUDENT student@mindful.se `6aacfb55c7905969d3b1e1cf` (Student doc = Anna Andersson `6aacfb56c7905969d3b1e1d5`).

## D. APL

### D1 — PASS
```
GET /api/apl/my   (Authorization: Bearer <student-jwt>)
-> 200
{"status":"YELLOW","aplStatus":"YELLOW","isSeeking":false,"placementCompany":null,"placementContact":null,"placementAddress":null,"internshipStartDate":null,"internshipEndDate":null,"requirements":null,"hasCv":false,"hasContract":false,"hasLogbook":false}
```
Real record for the logged-in student (resolved via req.user.email -> Student `_id`). No 404; email linkage correct.

### D2 — PASS (note field name)
```
PATCH /api/apl/my   {"isSeeking": true}
-> 200
{"success":true,"record":{"_id":"6aaf3b84a1a75ddf4af2f9b2","studentId":"6aacfb56c7905969d3b1e1d5","status":"YELLOW",...,"isSeeking":true,...}}
```
Read-back `GET /api/apl/my` -> `"isSeeking":true`. NOTE: the endpoint's real field is `isSeeking`, not `seeking`. A body of `{"seeking": true}` is silently ignored (backend `a/plService.modify`allowlist = `["isSeeking","cvDocId"]`). CV upload: not handled by this endpoint — it accepts an existing `cvDocId` reference only; no multipart upload wired here (matches the task note).

### D3 — PASS
```
GET /api/apl/records/6aacfb56c7905969d3b1e1d5   (staff token; student DOC _id, not user id)
-> 200  {record with studentId populated, status YELLOW, isSeeking true}  → same record the student sees
GET /api/apl/records        -> 200  [1 record]
GET /api/apl/eligible       -> 200  []   (no eligible-at-this-instant students — data)
GET /api/apl/statistics     -> 200  {"counts":{"GRAY":0,"BLUE":0,"YELLOW":1,"PURPLE":0,"RED":0,"GREEN":0},"total":1}
```

## E. Certificates — multi-step flow

Eligibility data found via `GET /api/certificates/candidates`: the only completed enrollment is Doris Dahl (`6aacfb56c7905969d3b1e219`).

### E1a — PASS (with the as-specified diplomacy check)
As specified:
```
POST /api/certificates   {"enrollmentId":"6aacfb56c7905969d3b1e219","type":"diplom"}
-> 400 {"message":"Diplom kräver att eleven är kopplad till ett kurspaket."}
```
That is the eligibility gate working correctly — this enrollment has no `coursePackageId` (data gap, not a bug). Reported per instructions.

With the eligible type (studieintyg) the create works:
```
POST /api/certificates   {"enrollmentId":"6aacfb56c7905969d3b1e219","type":"studieintyg"}
-> 201 {status:"draft", _id:"6aaf3ba9a1a75ddf4af2f9b3", ...}   (first call in this session)
Re-call when a draft already exists -> 200 with the existing record (dedup by enrollmentId+type — no duplicate drafts).
```

### E1b — PASS
```
POST /api/certificates/6aaf3ba9a1a75ddf4af2f9b3/approve
-> 200 {status:"approved", approvedBy:..., approvedAt:...}
```

### E1c — PASS (after fixing a genuine 500 bug)
First attempt:
```
POST /api/certificates/6aaf3ba9a1a75ddf4af2f9b3/generate
-> 500 {"success":false,"error":{"message":"The \"chunk\" argument must be of type string or an instance of Buffer, TypedArray, or DataView. Received type number (37)", ...}}
```
GENUINE BUG (not a test mistake): `backend/src/services/certificatePdf.js` `storePdfBuffer()` built `Readable.from(buffer)` — Node iterates a Buffer byte-by-byte, emitting numbers (37 = '%') to the GridFS upload stream. FIX: `Readable.from([buffer])`. After the fix:
```
-> 200 {status:"generated", certificateNumber:"ML-2026-00003", pdfFileId:"6aaf3fcc4ef6bcd40f61395f", grade:"C", ...}
```
PDF download: `200 application/pdf`, 186,093 bytes.

### E1d — PASS (no duplicates)
```
POST /api/certificates/6aaf3ba9a1a75ddf4af2f9b3/generate   (2nd time)
-> 200 {status:"generated", certificateNumber:"ML-2026-00003", pdfFileId:"6aaf3fcf4ef6bcd40f613961"}
```
The endpoint re-renders but DELETES the old GridFS file and keeps the SAME certificate number (`ML-2026-00003`). Verified in GridFS: exactly **1** file exists for this record (`studieintyg-Doris-Dahl-ML-2026-00003.pdf`), old file id gone. No duplicate PDFs. (Behavior = "safely returns existing/keeps stable" option.)

### E2 — PASS
```
GET /api/certificates/6aaf3ba9a1a75ddf4af2f9b3
-> 200 {status:"generated", certificateNumber:"ML-2026-00003", pdfFileId:"6aaf3fcf4ef6bcd40f613961", ...}
```
PDF text extracted (`pdftotext`): contains "Underskrift" + "REKTOR" block only. NO text claiming a cryptographic/digital signature (no "kryptografisk", "signerad", "certifikat"-based signature claims).

## BONUS: Audit log path — PASS (empty data)
```
GET /api/auditlogs/6aacfb56c7905969d3b1e1db   (bearer admin)
-> 200 {"total":0,"page":1,"limit":10,"logs":[]}
```
Path is correct and returns the right shape. `fileauditlogs` collection contains 0 rows in this DB, so the list is legitimately empty (data, not a route bug).

## Summary
| Test | Verdict |
|------|---------|
| D1 GET /api/apl/my | PASS |
| D2 PATCH /api/apl/my | PASS (field is `isSeeking`) |
| D3 staff APL endpoints | PASS |
| E1a create draft | PASS (diplom fails eligibility = data gap; studieintyg works 201) |
| E1b approve | PASS |
| E1c generate | PASS after fixing `Readable.from([buffer])` 500 bug |
| E1d regenerate | PASS (same cert number, old PDF deleted, no duplicates) |
| E2 status + no crypto-signature | PASS |
| BONUS audit logs | PASS (empty data) |

One production bug was found and fixed: `certificatePdf.js` line storing the PDF in GridFS.