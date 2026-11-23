# Requirements for Students to Show in `/betyg` View

## Base Requirements (for all students)

- The enrollment/course has passed its `endDate` (end date is in the past)
- The grade is **null** or **empty** (`grade: null` or `grade: ""`)
- The enrollment status is one of: `"enrolled"`, `"active"`, or `"completed"`
- For `Student.education` entries: `removedAt` must be `null`

## Teacher-Specific Visibility Rules

A teacher sees a student if **any** of the following conditions are met:

### 1. Direct Student Responsibility
- The teacher is set as the student's `teacherId` (responsible teacher)

### 2. Course Instance Responsibility
- The teacher is the `responsibleTeacher` for the course instance
- **All students enrolled in that course instance are visible** (no exam requirement)

### 3. Exam-Based Visibility (if not directly responsible)
- The student has an `ExamAttendance` record where:
  - `studentId` matches the student
  - `courseId` matches the course
  - `teacherId` matches the teacher
- **OR** the student has an entry in `examHistory` where:
  - `teacherId` matches the teacher
  - `courseId` matches the course

## Important Notes

- **Admins/systemadmins** see all students (no filtering applied)
- The logic checks both `StudentEnrollment` records and `Student.education` entries
- For course instance responsibility, all enrolled students are visible regardless of exams
- For other cases, exam records are required for visibility

## Example

If Ulrika is the `responsibleTeacher` for course instance `VGYORFSF2512v1`, she will see **all students enrolled in that instance** who meet the base requirements, regardless of whether they have exam records.
