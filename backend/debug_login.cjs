const axios = require('axios');

const API = 'http://localhost:5010';

async function main() {
    // Login - don't use maxRedirects: 0
    const login = await axios.post(`${API}/api/auth/login`, {
        email: 'admin@mindful.se',
        password: 'Admin123!'
    }, { withCredentials: true });

    console.log('Login status:', login.status);
    console.log('Token cookie set');
    console.log('User role:', login.data.user.role);
    
    // Make request with the cookie - just use default behavior
    const students = await axios.get(`${API}/api/students`, { withCredentials: true });
    console.log('Students status:', students.status);
    console.log('Students count:', students.data?.length || 0);
}

main().catch(err => console.error(err));
