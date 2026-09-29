# Frontend Feature Verification

Behaviour-level verification of the student/APL features with **Vitest + Testing Library**.
Tests assert what a user can observe in the DOM (roles, labels, links, focus), not internal refs.

- **Command:** `cd frontend && NODE_ENV=test npx vitest run --mode test --coverage.enabled=false`
- **Latest full result:** `30 passed | 1 skipped (31 files)` — `331 passed | 12 skipped (343 tests)`
- **Open defects in this scope:** none — all findings below are fixed and covered by passing tests
- **Lint:** `make lint` → 0 errors (backend 14 pre-existing warnings, frontend 0)

## Test harness

| File | Purpose |
| --- | --- |
| `tests/helpers/render.js` | `renderWithVuetify`, `renderWithStore`, `buildStore`, `buildRouter`, `ok`, `httpError`, `mockToast` |
| `tests/setup.js` | Vuetify plugin, `@testing-library/jest-dom`, automatic `cleanup()` |

All suites mount through `renderWithVuetify`, so the real Vuetify plugin, a Vuex store and a
memory router are wired exactly as in production.

---

## 1. APL-status board — `views/APLView.vue`

Suite: `tests/features/apl-view.test.js` — **9 passed**

| # | Task | Result |
| --- | --- | --- |
| 1.1 | Requests `/students` on mount | PASS |
| 1.2 | Renders heading and all three tabs (Pågående / Avslutad / APL-kontrakt) | PASS |
| 1.3 | Renders every status column with its student count | PASS |
| 1.4 | Shows a loading message while the request is in flight | PASS |
| 1.5 | Shows a user-facing error when the request fails | PASS |
| 1.6 | Stops claiming to be loading once a request has failed | PASS *(was BUG-APL-01)* |
| 1.7 | Distinguishes an empty result from a failure | PASS |
| 1.8 | Offers a working retry control after a failed request | PASS *(was GAP-APL-02)* |
| 1.9 | Non-array response degrades to an empty list instead of crashing | PASS |

### BUG-APL-01 — "Loading" shown next to a failure message — FIXED
`views/APLView.vue:14`

The `v-else` branch rendered **"Laddar pågående APL..."** whenever `students` was empty. On
failure `students` stays `[]`, so the loading text sat permanently beneath the error alert: the
user was told the load failed *and* that it was still loading.

**Fix:** added a `loaded` ref and split the empty branch three ways — error, still-loading, and
genuinely-empty — so each state renders its own message.

### GAP-APL-02 — alert said "Försök igen" with nothing to click — FIXED
The error copy ended with *"Försök igen"* but nothing re-triggered `fetchStudents`; only a full
page reload retried. The copy also duplicated the instruction.

**Fix:** removed the redundant sentence from `loadError` and added a real `v-btn` in the alert's
`#append` slot wired to `fetchStudents`. Covered by test 1.8, which asserts the retry both
re-issues the request and renders the students.

---

## 2. APL kanban board — `components/APLBoard.vue`

Suite: `tests/features/apl-board.test.js` — **12 passed**

| # | Task | Result |
| --- | --- | --- |
| 2.1 | Renders all six status columns in order | PASS |
| 2.2 | Places each student in the column matching `aplStatus` | PASS |
| 2.3 | Each card links to `/student/:id` | PASS |
| 2.4 | Excludes students flagged `dropout` | PASS |
| 2.5 | Excludes students without a `CoursePackage` education entry | PASS |
| 2.6 | Filters by name as the user types | PASS |
| 2.7 | Filter matching is case-insensitive | PASS |
| 2.8 | Filters by e-mail | PASS |
| 2.9 | Narrows to one status via the colour filter | PASS |
| 2.10 | "Totalt antal studenter" follows the filter | PASS |
| 2.11 | Empty board renders without crashing | PASS |
| 2.12 | Drag-and-drop persists the new status via `PATCH /students/:id` | PASS |

Note: `handleDragStart` (`components/APLBoard.vue:524`) only stores the student in a ref, so
the test dispatches plain `dragstart`/`drop` events — jsdom has no `DataTransfer` and no
polyfill was added (per `AGENTS.md`).

---

## 3. Student APL status — `views/Student/tabs/GeneralTab.vue`

Suite: `tests/features/student-apl-status.test.js` — **11 passed**

| # | Task | Result |
| --- | --- | --- |
| 3.1 | Shows the human-readable label for the current APL status | PASS |
| 3.2 | Falls back to "Ej angivet" when there is no status | PASS |
| 3.3 | Hides the edit control from non-admin roles | PASS |
| 3.4 | Offers the edit control to admins | PASS |
| 3.5 | Admin changes the status → `PUT /student-details/:id` carries `aplStatus` | PASS |
| 3.6 | Edit dropdown offers all six statuses | PASS |
| 3.7 | Returns to view mode after a successful save | PASS |
| 3.8 | Failed save keeps edit mode open and raises a toast | PASS |
| 3.9 | Cancel discards without saving | PASS |
| 3.10 | Form re-initialises when the `student` prop changes | PASS |
| 3.11 | Label is associated with the dropdown | PASS *(was A11Y-APL-01)* |

### A11Y-APL-01 — "APL-status:" label not associated with the select — FIXED
`views/Student/tabs/GeneralTab.vue:20`

The `<label>` had no `for` and did not wrap the `<select>`, so it was not programmatically
associated. Assistive tech announced an unlabelled dropdown, and clicking the label did not move
focus to it. Testing Library could not resolve the field by label at all.

**Fix:** gave the select `id="apl-status"` and the label a matching `for`.

---

## 4. Role projection / AV-2 — support & deviation cards

Suite: `tests/features/student-detail-role-projection.test.js` — **16 passed**

API policy: `/support` and `/deviations` allow `systemadmin`, `admin`, `syv`, `specped`;
they deny `teacher`, `coordinator` and students. Creating a deviation is a separate, permitted
action for `teacher`/`admin`/`systemadmin`.

| # | Task | Result |
| --- | --- | --- |
| 4.1 | `admin` sees both cards | PASS |
| 4.2 | `systemadmin` sees both cards | PASS |
| 4.3 | `syv` sees both cards | PASS |
| 4.4 | `specped` sees both cards | PASS |
| 4.5 | `teacher` does not see the support card | PASS |
| 4.6 | `coordinator` sees neither card | PASS |
| 4.7 | Support contacts fetched for an allowed role | PASS |
| 4.8 | Deviations fetched for an allowed role | PASS |
| 4.9 | `syv` never gets the admin edit control | PASS |
| 4.10 | `admin` gets the admin edit control | PASS |
| 4.11 | Teacher cannot see support contacts even when present | PASS |
| 4.12 | No support/deviation request for a denied role | PASS *(was BUG-AV2-01)* |
| 4.13 | Teacher keeps "+ Ny avvikelse" | PASS *(was GAP-AV2-02)* |
| 4.14 | Teacher cannot read the existing deviation list | PASS |
| 4.15 | Teacher does not get the support card | PASS |
| 4.16 | Coordinator gets no create button | PASS |

### REGRESSION-1 — AV-2 gate hid the cards from *every* role — FIXED
Found while writing this suite; the most serious issue of the pass.

`views/Student/tabs/GeneralTab.vue` is Options API with an explicit `setup()` **return object**.
The AV-2 change added `canViewSupportDeviations` and `isSyv` to the script body but not to the
returned bindings, so the template resolved `canViewSupportDeviations` as `undefined` and both
cards were hidden for **all** roles, including admins.

```js
// setup() returned: isAdmin, isSpecped, canCreateDeviation
// but NOT isSyv / canViewSupportDeviations
```

**Fix:** added `isSyv` and `canViewSupportDeviations` to the return object
(`views/Student/tabs/GeneralTab.vue:1098`). Tests 4.1–4.4 lock this in so it cannot regress.

### BUG-AV2-01 — hidden cards, but the requests still fired — FIXED
`views/Student/tabs/GeneralTab.vue:907` and `:966`

`loadSupportInfo()` and `loadDeviations()` ran on mount regardless of role, so a teacher or
coordinator triggered `GET /student-details/:id/support` and `/deviations` on every student page
load. The API answers **403**, producing console errors and failed requests for data the role
may not see.

**Fix:** both loaders now return early unless `canViewSupportDeviations` is true. Covered by test
4.12, which asserts no `/student-details/` request is issued at all for a denied role.

### GAP-AV2-02 — teacher's "create deviation" affordance disappeared — FIXED
`canCreateDeviation` allows `teacher`, but the whole deviation card was hidden by
`canViewSupportDeviations`, so a teacher lost the "+ Ny avvikelse" button even though the API
permits them to file one.

**Fix:** the deviation card now renders for `canViewSupportDeviations || canCreateDeviation`, and
the read-only list is gated separately. A teacher sees the create button plus an explanatory line
("Du kan rapportera en avvikelse, men inte se tidigare avvikelser.") instead of the list they are
not allowed to read. The support card stays hidden for teachers, since they cannot create support
contacts.

---

## Cross-cutting issues fixed while testing

| Issue | Detail |
| --- | --- |
| `vi.mock` factory parse error | `    }),\n})` closed the object early, making the file a syntax error. Vitest reported it as a confusing `Failed to parse source for import analysis / Expected ',', got ')'` on the **first** import. Correct form is `    },\n}))`. This was the real cause of the long-standing "Vite parsing issue", not a config problem. |
| `renderWithVuetify` clobbered plugins | Passing `global.plugins` replaced the router+store instead of merging, so `store` was `undefined` and every component using `store.getters` failed. Now merged: `plugins: [router, store, ...extra]`. |
| `vi.clearAllMocks()` leaked `*Once` mocks | `clearAllMocks` clears recorded calls but **not** queued `mockResolvedValueOnce`/`mockRejectedValueOnce` values, so a previous test's "success" response was consumed by the next test's "failure" case, making a failure test silently pass. New suites use `vi.resetAllMocks()`. |

---

## Deferred / not yet covered

- `views/Student/tabs/AplTab.vue` — stale suite, 5 tests skipped (`tests/unit/AplTab.test.js`)
- `LogbookTab.vue`, `StudyPlanTab.vue`, `DocumentsTab.vue`, `PermissionsTab.vue`, `CourseArchiveTab.vue`
- `views/Student/ListStudent.vue`, `StudentQuestionBank.vue`, `StudyPlanRevisionModal.vue`
- `GeneralTab.vue` comments card, exam accommodations, dropout flow
- Playwright screenshots: 40-route capture script exists (`scripts/capture-feature-screenshots.mjs`); rerun pending
