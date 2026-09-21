const axios = require('axios');

const API = 'http://localhost:5010';

// Test available routes
async function testRoutes() {
    // Try different register endpoints
    try {
        const r1 = await axios.post(`${API}/auth/register`, {
            username: 'testuser',
            email: 'test@test.local',
            password: 'TestPass123!'
        });
        console.log('/auth/register success:', r1.data);
    } catch (e) {
        console.log('/auth/register failed:', e.response?.status, e.response?.data);
    }
    
    try {
        const r2 = await axios.post(`${API}/api/auth/register`, {
            username: 'testuser2',
            email: 'test2@test.local',
            password: 'TestPass123!'
        });
        console.log('/api/auth/register success:', r2.data);
    } catch (e) {
        console.log('/api/auth/register failed:', e.response?.status, e.response?.data);
    }
    
    try {
        const r3 = await axios.post(`${API}/users/register`, {
            username: 'testuser3',
            email: 'test3@test.local',
            password: 'TestPass123!',
            role: 'admin'
        });
        console.log('/users/register success:', r3.data);
    } catch (e) {
        console.log('/users/register failed:', e.response?.status, e.response?.data);
    }
}

testRoutes();
