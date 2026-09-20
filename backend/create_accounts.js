const axios = require('axios');

const API = 'http://localhost:5010';

async function createAccounts() {
    // Step 1: Register admin
    await axios.post(`${API}/auth/register`, {
        username: 'adminuser',
        email: 'admin@test.local',
        password: 'AdminPass123!'
    });
    console.log('1. Admin registered');

    // Step 2: Login as admin
    const login = await axios.post(`${API}/auth/login`, {
        email: 'admin@test.local',
        password: 'AdminPass123!'
    }, { withCredentials: true, jar: true });
    console.log('2. Admin logged in, role:', login.data.user.role);

    // Step 3: Register Teacher A
    await axios.post(`${API}/auth/register`, {
        username: 'teacherA',
        email: 'teacherA@test.local',
        password: 'TeacherPass123!'
    });
    console.log('3. TeacherA registered');

    // Step 4: Register Teacher B
    await axios.post(`${API}/auth/register`, {
        username: 'teacherB',
        email: 'teacherB@test.local',
        password: 'TeacherPass123!'
    });
    console.log('4. TeacherB registered');

    // Step 5: Register Student 1
    await axios.post(`${API}/auth/register`, {
        username: 'student1',
        email: 'student1@test.local',
        password: 'StudentPass123!'
    });
    console.log('5. Student1 registered');

    // Step 6: Register Student 2
    await axios.post(`${API}/auth/register`, {
        username: 'student2',
        email: 'student2@test.local',
        password: 'StudentPass123!'
    });
    console.log('6. Student2 registered');
}

createAccounts().catch(err => console.error('Error:', err.message));
