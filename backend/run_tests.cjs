const axios = require('axios');

const API = 'http://localhost:5010';

async function runTests() {
    const results = {};
    
    // ===== A. TEACHER MANAGEMENT =====
    console.log('=== A. TEACHER MANAGEMENT ===');
    
    // A1: Login as admin, create teacher
    const loginA = await axios.post(`${API}/api/auth/login`, {
        email: 'admin@mindful.se',
        password: 'Admin123!'
    }, { withCredentials: true });
    results.a1_login = loginA.data.user.role;
    console.log('A1: Admin logged in, role:', loginA.data.user.role);
    
    // Create Teacher A with kommun Stockhlm
    const teacherA = await axios.post(`${API}/api/admin/teacher`, {
        username: 'teacherA',
        email: 'teacherA@mindful.se',
        subject: 'Matematik',
        generatePassword: true
    }, { withCredentials: true });
    results.a2_teacherA_created = teacherA.data.message;
    console.log('A2: TeacherA created:', teacherA.data.message);
    
    // Assign Teacher A to one municipality (Stockholm)
    const assignA = await axios.put(`${API}/api/users/teacherA/municipalities`, {
        municipalities: ['Stockholm']
    }, { withCredentials: true });
    results.a3_municipality_assigned = assignA.data.message;
    console.log('A3: TeacherA municipality assigned:', assignA.data.message);
    
    // A4: Deactivate Teacher A and test immediate denial
    // First, let's update the user to set active: false
    // Actually, let me check the user model - we need to set active: false
    // Looking at the code, the /users/:userId/permissions endpoint can update permissions
    // And there's active field in the user model
    // Let me try updating the user's active status
    try {
        const deactivateA = await axios.put(`${API}/api/users/teacherA`, {
            active: false
        }, { withCredentials: true });
        results.a4_deactivate = deactivateA.data.message;
        console.log('A4: TeacherA deactivated:', deactivateA.data.message);
        
        // Now try to load student list as Teacher A (but Teacher A is deactivated)
        // First need to login as Teacher A
        const teacherALogin = await axios.post(`${API}/api/auth/login`, {
            email: 'teacherA@mindful.se',
            password: 'Teacher123!' // This might be the temp password
        }, { withCredentials: true });
        console.log('TeacherA login role:', teacherALogin.data.user.role);
        
        // Try to access students
        try {
            const students = await axios.get(`${API}/api/students`, { withCredentials: true });
            results.a4_student_list = `success=${students.data.length > 0}, count=${students.data.length}`;
            console.log('A4: TeacherA student list count:', students.data.length);
        } catch (e) {
            results.a4_student_list = `denied:${e.response?.status}`;
            console.log('A4: TeacherA student list denied:', e.response?.status);
        }
    } catch (e) {
        results.a4_deactivate = `failed:${e.response?.status}`;
        console.log('A4: Deactivate failed:', e.response?.status);
    }
    
    // A5: Reactivate and remove permission
    try {
        const reactivateA = await axios.put(`${API}/api/users/teacherA`, {
            active: true
        }, { withCredentials: true });
        results.a5_reactivate = reactivateA.data.message;
        console.log('A5: TeacherA reactivated:', reactivateA.data.message);
        
        // Remove grading permission
        // Need to update permissions via /api/users/:id/permissions
        const permissionCheck = await axios.put(`${API}/api/users/teacherA/permissions`, {
            grading: false // This might not be the right format
        }, { withCredentials: true });
        results.a5_permission_remove = permissionCheck.data.message;
        console.log('A5: Permission removed:', permissionCheck.data.message);
    } catch (e) {
        results.a5_reactivate = `failed:${e.response?.status}`;
        results.a5_permission_remove = `failed:${e.response?.status}`;
        console.log('A5: React/perm failed:', e.response?.status);
    }
    
    // ===== B. STUDENT MANAGEMENT =====
    console.log('\n=== B. STUDENT MANAGEMENT ===');
    
    // B1: Create Student 1
    try {
        const s1 = await axios.post(`${API}/student`, {
            name: 'Student One',
            email: 'student1@test.local',
            personalNumber: '199001011234',
            municipality: 'Stockholm',
            education: [
                { type: 'Course', courseCode: 'MAT101', grade: '' }
            ]
        }, { withCredentials: true });
        results.b1_student1 = s1.data.message || 'ok';
        console.log('B1: Student1 created:', s1.data.message || 'ok');
    } catch (e) {
        results.b1_student1 = `failed:${e.response?.status}`;
        console.log('B1: Student1 creation failed:', e.response?.status, (e.response?.data&&e.response.data.message) || e.message);
    }
    
    // B2: Create Student 1 again (same personnummer, different courses) - should report alreadyExists
    try {
        const s2 = await axios.post(`${API}/student`, {
            name: 'Student One Duplicate',
            email: 'student1dup@test.local',
            personalNumber: '199001011234', // same personnummer
            municipality: 'Stockholm',
            education: [
                { type: 'Course', courseCode: 'ENG101', grade: '3' }
            ]
        }, { withCredentials: true });
        results.b2_alreadyExists = s2.data.alreadyExists;
        console.log('B2: Already exists flag:', s2.data.alreadyExists, 'dropout cleared:', !s2.data.dropout);
    } catch (e) {
        results.b2_alreadyExists = `failed:${e.response?.status}`;
        console.log('B2: Already exists test failed:', e.response?.status);
    }
    
    // B3: Low-privilege staff (coordinator) viewing student profile
    try {
        const coordLogin = await axios.post(`${API}/api/auth/login`, {
            email: 'coordinator@mindful.se',
            password: 'Teacher123!'
        }, { withCredentials: true });
        console.log('Coord login role:', coordLogin.data.user.role);
        
        // Get student 1 profile - but we need a student ID first
        // Let's list students
        const studentsList = await axios.get(`${API}/api/students`, {
            withCredentials: true
        });
        const studentId = studentsList.data?.[0]?._id || studentsList.data?.[0]?._id;
        console.log('Student list length:', studentsList.data.length);
        
        if (studentId) {
            const studentProfile = await axios.get(`${API}/api/students/${studentId}`, {
                withCredentials: true
            });
            const student = studentProfile.data;
            // Check sensitive fields
            results.b3_fields = {
                personnummer: student.personalNumber ? 'visible' : 'hidden',
                supportNotes: student.additionalInfo ? 'visible' : 'hidden',
                examAccommodations: student.exam ? 'visible' : 'hidden'
            };
            console.log('B3: Sensitive fields visible:', JSON.stringify(results.b3_fields));
        }
    } catch (e) {
        console.log('B3: Failed:', e.response?.status);
    }
    
    // B4: Teacher A (scoped) searching students - should only see students in their kommun
    try {
        const teacherALogin = await axios.post(`${API}/api/auth/login`, {
            email: 'teacherA@mindful.se',
            password: 'Teacher123!'
        }, { withCredentials: true });
        console.log('TeacherA login role:', teacherALogin.data.user.role);
        
        const searchResults = await axios.get(`${API}/api/students`, {
            withCredentials: true
        });
        results.b4_teacherA_count = searchResults.data.length;
        console.log('B4: TeacherA sees', searchResults.data.length, 'students');
    } catch (e) {
        console.log('B4: Failed:', e.response?.status);
    }
    
    // B5: Teacher B (global scope) searching students - should see all students
    try {
        const teacherBLogin = await axios.post(`${API}/api/auth/login`, {
            email: 'teacherB@mindful.se',
            password: 'Teacher123!'
        }, { withCredentials: true });
        console.log('TeacherB login role:', teacherBLogin.data.user.role);
        
        const searchResults = await axios.get(`${API}/api/students`, {
            withCredentials: true
        });
        results.b5_teacherB_count = searchResults.data.length;
        console.log('B5: TeacherB sees', searchResults.data.length, 'students');
    } catch (e) {
        console.log('B5: Failed:', e.response?.status);
    }
    
    // B6: Admin attempting to delete all course instances without confirmation token
    try {
        const adminLogin = await axios.post(`${API}/api/auth/login`, {
            email: 'admin@mindful.se',
            password: 'Admin123!'
        }, { withCredentials: true });
        
        // Try to trigger delete all students without confirmation token
        const deleteAttempt = await axios.delete(`${API}/api/students`, {
            withCredentials: true
        });
        results.b6_delete = deleteAttempt.data.message;
        console.log('B6: Delete attempt result:', deleteAttempt.data.message);
    } catch (e) {
        results.b6_delete = `failed:${e.response?.status}`;
        console.log('B6: Delete attempt failed:', e.response?.status, (e.response?.data&&e.response.data.message) || e.message);
    }
    
    console.log('\n=== TESTS COMPLETE ===');
    console.log('Results:', JSON.stringify(results, null, 2));
}

runTests().catch(err => console.error('Fatal error:', err.message));
