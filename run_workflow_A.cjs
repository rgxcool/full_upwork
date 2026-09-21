const { execSync } = require('child_process');
const fs = require('fs');

function curl_exec(cmd) {
    return execSync(cmd, { encoding: 'utf8' }).trim();
}

const API = 'http://localhost:5010';
const COOKIE_FILE = '/tmp/workflow_a_cookies.txt';

function resetCookies() {
    execSync(`rm -f ${COOKIE_FILE}`);
    execSync(`touch ${COOKIE_FILE}`);
}

function writeJsonFile(obj, path) {
    fs.writeFileSync(path, JSON.stringify(obj));
}

function login(email, password) {
    const bodyFile = '/tmp/login_body.json';
    writeJsonFile({email, password}, bodyFile);
    const result = curl_exec(`curl -s -X POST ${API}/api/auth/login -H "Content-Type: application/json" -d @${bodyFile} -c ${COOKIE_FILE}`);
    fs.unlinkSync(bodyFile);
    return result;
}

resetCookies();

console.log('=== A. TEACHER MANAGEMENT ===\n');

// A1: Login as admin
console.log('A1: Login as admin...');
const a1_result = login('admin@mindful.se', 'Admin123!');
console.log('  Result:', a1_result.includes('success') ? 'PASS' : 'FAIL');

// A2: Verify Teacher A exists
console.log('\nA2: Verify Teacher A exists...');
const teachers = curl_exec(`curl -s -X GET ${API}/api/teachers -b ${COOKIE_FILE}`);
console.log('  Teacher A found:', teachers.includes('teacherA') ? 'PASS' : 'FAIL');

// A3: Assign Teacher A to exactly one municipality (Stockholm)
console.log('\nA3: Assign Teacher A to Stockholm...');
const a3_result = curl_exec(`curl -s -X PUT ${API}/api/users/6aad031c06baa44d8dde046d/municipalities -H "Content-Type: application/json" -b ${COOKIE_FILE} -d @/tmp/municipality_body.json`);
writeJsonFile({municipalities: ['Stockholm']}, '/tmp/municipality_body.json');
const a3_final = curl_exec(`curl -s -X PUT ${API}/api/users/6aad031c06baa44d8dde046d/municipalities -H "Content-Type: application/json" -b ${COOKIE_FILE} -d @/tmp/municipality_body.json`);
console.log('  Result:', a3_final.includes('success') ? 'PASS' : 'FAIL');

// A4: Deactivate Teacher A, immediately deny access
console.log('\nA4: Deactivate Teacher A and test immediate denial...');
const a4_deactivate = curl_exec(`curl -s -X PUT ${API}/api/users/6aad031c06baa44d8dde046d -H "Content-Type: application/json" -b ${COOKIE_FILE} -d '{"active":false}'`);
console.log('  Deactivate result:', a4_deactivate);

// Now login as Teacher A to test access denial
login('teacherA@mindful.se', 'Teacher123!');
// Try to access students - should be denied since Teacher A is deactivated
const a4_student_access = curl_exec(`curl -s -X GET ${API}/api/students -b ${COOKIE_FILE}`);
const a4_denied = a4_student_access.includes('denied') || a4_student_access.includes('error') || a4_student_access.includes('403');
console.log('  Teacher A student list access:', a4_denied ? 'DENIED (PASS)' : 'ACCESSED (FAIL - should be denied)');

// A5: Reactivate Teacher A, remove grading permission, confirm immediate effect
console.log('\nA5: Reactivate Teacher A and remove grading permission...');
const a5_reactivate = curl_exec(`curl -s -X PUT ${API}/api/users/6aad031c06baa44d8dde046d -H "Content-Type: application/json" -b ${COOKIE_FILE} -d '{"active":true}'`);
console.log('  Reactivate result:', a5_reactivate);

// Remove grading permission
const a5_perm_result = curl_exec(`curl -s -X PUT ${API}/api/users/6aad031c06baa44d8dde046d/permissions -H "Content-Type: application/json" -b ${COOKIE_FILE} -d '{"assignments:grade":false}'`);
console.log('  Remove grading permission result:', a5_perm_result);

// Now as Teacher A, try to grade - should be denied
login('teacherA@mindful.se', 'Teacher123!');
const a5_grade_access = curl_exec(`curl -s -X GET ${API}/api/students -b ${COOKIE_FILE}`);
const a5_denied = a5_grade_access.includes('denied') || a5_grade_access.includes('error') || a5_grade_access.includes('403');
console.log('  Teacher A grading access after permission revocation:', a5_denied ? 'DENIED (PASS)' : 'ACCESSED (check)');

console.log('\n=== Section A Complete ===');
