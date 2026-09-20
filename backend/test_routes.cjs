const axios = require('axios');

const API = 'http://localhost:5010';

async function testRoutes() {
    // Try the predefined test users
    const testUsers = [
        { email: 'admin@mindful.se', password: 'Admin123!', label: 'admin' },
        { email: 'teacher@mindful.se', password: 'Teacher123!', label: 'teacher' },
        { email: 'coordinator@mindful.se', password: 'Teacher123!', label: 'coord' },
        { email: 'student@mindful.se', password: 'Student123!', label: 'student' },
    ];
    
    for (const user of testUsers) {
        try {
            const login = await axios.post(`${API}/api/auth/login`, {
                email: user.email,
                password: user.password
            }, { withCredentials: true });
            console.log(`${user.label}: login successful, role=${login.data.user.role}`);
        } catch (e) {
            console.log(`${user.label}: login failed - ${e.response?.status}`);
        }
    }
}

testRoutes();
