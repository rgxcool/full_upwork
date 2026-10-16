## B4: Teacher Municipality Filtering - Status and Fix

### Issue
Teacher A (scoped to Stockholm) sees 7 students, but only 2 have `municipality: {'type': 'Stockholm'}`, while 5 have `municipality: null`.

### Root Cause
The `municipalityInScope()` function in `backend/src/utils/tenantScope.js`:
- Returns `true` if user has global scope (no municipalities assigned)
- Returns `false` if student's municipality is `null` or `undefined`
- Otherwise checks if student's municipality is in user's municipalities

### Impact
- Students with `municipality: null` are excluded from ALL scopes (including admin/global)
- Students with `municipality: {'type': 'Stockholm'}` are only visible to users with Stockholm in their scope
- Teacher A currently sees 7 students because the listing may not be applying the filter correctly, OR the students' municipality states are inconsistent

### Fix Required
1. **Assign municipalities to all students** - Ensure all students have either `{'type': 'Stockholm'}` or another specific municipality
2. **Verify the filtering applies** - The `studentScopeFilter` middleware in `studentRoutes.js` should apply the filter, but needs students with proper municipality data

### Test B4 Verification
After fixing student municipalities:
- Teacher A (Stockholm) should see ONLY students with Stockholm municipality
- Teacher B (global/no municipality) should see ALL students regardless of their municipality
