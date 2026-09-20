const axios = require('axios');

const API = 'http://localhost:5010';

async function createAccounts() {
    // Register admin
    await axios.post(`${API}/auth/register`, {
        username: 'adminuser',
        email: 'admin@test.local',
        password: 'AdminPass123!'
    });
    console.log('1. Admin registered');

    // Login as admin
    const login = await axios.post(`${API}/auth/login`, {
        email: 'admin@test.local',
        password: 'AdminPass123!'
    }, { withCredentials: true, jar: true });
    console.log('2. Admin logged in, role:', login.data.user.role);

    // Register Teacher A
    await axios.post(`${API}/auth/register`, {
        username: 'teacherA',
        email: 'teacherA@test.local',
        password: 'TeacherPass123!'
    });
    console.log('3. TeacherA registered');

    // Register Teacher B
    await axios.post(`${API}/auth/register`, {
        username: 'teacherB',
        email: 'teacherB@test.local',
        password: 'TeacherPass123!'
    });
    console.log('4. TeacherB registered');

    // Register Student 1
    await axios.post(`${API}/auth/register`, {
        username: 'student1',
        email: 'student1@test.local',
        password: 'StudentPass123!'
    });
    console.log('5. Student1 registered');

    // Register Student 2
    await axios.post(`${API}/auth/register`, {
        username: 'student2',
        email: 'student2@test.local',
        password: 'StudentPass123!'
    });
    console.log('6. Student2 registered');
    
    // Create Teacher profiles via /api/admin/teacher
    // Login again
    const login2 = await axios.post(`${API}/auth/login`, {
        email: 'admin@test.local',
        password: 'AdminPass123!'
    }, { withCredentials: true, jar: true });
    
    // Create Teacher A
    try {
        const teacherACreate = await axios.post(`${API}/admin/teacher`, {
            username: 'teacherA',
            email: 'teacherA@test.local',
            subject: 'Matematik',
            generatePassword: true
        }, { withCredentials: true });
        console.log('7. TeacherA created:', teacherACreate.data.message);
    } catch (e) {
        console.log('7. TeacherA creation failed:', e.response?.status, (e.response?.data||e.message));
    }
    
    // Create Teacher B
    try {
        const teacherBCreate = await axios.post(`${API}/admin/teacher`, {
            username: 'teacherB',
            email: 'teacherB@test.local',
            subject: 'Svenska',
            generatePassword: true
        }, { withCredentials: true });
        console.log('8. TeacherB created:', teacherBCreate.data.message);
    } catch (e) {
        console.log('8. TeacherB creation failed:', e.response?.status, (e.response?.data||e.message));
    }
    
    // Now let's assign municipalities to teachers
    // First, get the municipality list
    try {
        const municipalities = await axios.get(`${API}/api/permissions`, { withCredentials: true });
        console.log('Municipalities available');
    } catch (e) {
        // ignore
    }
    
    // Assign municipality to Teacher A (Stockholm)
    try {
        const telA = await axios.put(`${API}/users/teacherA/municipalities`, {
            municipalities: ['Stockholm']
        }, { withCredentials: true });
        console.log('9. TeacherA municipality assigned:', telA.data);
    } catch (e) {
        console.log('9. TeacherA municipality assign failed:', e.response?.status, (e.response?.data||e.message));
    }
    
    // Teacher B has no municipality (global scope)
    // That's the default - no municipalities assigned
    
    // Create Student 1 with course enrollment
    try {
        const student1Create = await axios.post(`${API}/student`, {
            name: 'Student One',
            email: 'student1@test.local',
            personalNumber: '199001011234',
            municipality: 'Stockholm',
            education: [
                {
                    type: 'Course',
                    courseCode: 'MAT101',
                    grade: ''
                }
            ]
        }, { withCredentials: true });
        console.log('10. Student1 created with course:', student1Create.data.message || 'ok');
    } catch (e) {
        console.log('10. Student1 creation failed:', e.response?.status, (e.response?.data||e.message));
    }
    
    // Create Student 2 (already enrolled with completed course)
    try {
        const student2Create = await axios.post(`${API}/student`, {
            name: 'Student Two',
            email: 'student2@test.local',
            personalNumber: '199001015678',
            municipality: 'Stockholm',
            education: [
                {
                    type: 'Course', 
                    courseCode: 'ENG101',
                    grade: '3'
                }
            ]
        }, { withCredentials: true });
        console.log('11. Student2 created with grade:', student2Create.data.message || 'ok');
    } catch (e) {
        console.log('11. Student2 creation failed:', e.response?.status, (e.response?.data||e.message));
    }
}

createAccounts().catch(err => console.error('Error:', err.message));
