const { execSync } = require('child_process');

// Use curl to test the workflow
// First, login and get the token
const loginCmd = `curl -s -X POST http://localhost:5010/api/auth/login -H "Content-Type: application/json" -d '{"email":"admin@mindful.se","password":"Admin123!"}' -c /tmp/cookies.txt`;
console.log(execSync(loginCmd).toString().substring(0, 200));

// Then check the cookie
const checkCmd = `cat /tmp/cookies.txt`;
console.log(execSync(checkCmd).toString().substring(0, 200));

// Then access students
const studentsCmd = `curl -s http://localhost:5010/api/students -b /tmp/cookies.txt`;
console.log(execSync(studentsCmd).toString().substring(0, 500));
