const { execSync } = require('child_process');

function curl_exec(cmd) {
    return execSync(cmd, { encoding: 'utf8' }).trim();
}

const API = 'http://localhost:5010';
const COOKIE = '/tmp/test_api_cookies.txt';

// Login first
const login = curl_exec(`curl -s -X POST ${API}/api/auth/login -H "Content-Type: application/json" -d '{"email":"student@mindful.se","password":"Student123!"}' -b $COOKIE 2>/dev/null || curl -s -X POST ${API}/api/auth/login -H "Content-Type: application/json" -d '{"email":"student@mindful.se","password":"Student123!"}' -c $COOKIE`);
console.log('Login:', login.substring(0, 100));

// Try various APL-related endpoints
const endpoints = [
    '/api/apl',
    '/api/apl/board',
    '/api/student',
    '/api/apl/status',
    '/api/apl/board/6aad03af06baa44d8dde0474',
];

for (const ep of endpoints) {
    const result = curl_exec(`curl -s -X GET ${API}${ep} -b /tmp/test_api_cookies.txt 2>/dev/null || curl -s -X GET ${API}${ep} -b $COOKIE 2>/dev/null || echo "failed"`);
    console.log(`${ep}: ${result.substring(0, 100)}`);
}
