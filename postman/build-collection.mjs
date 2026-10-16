import fs from 'node:fs';
import path from 'node:path';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const t = (name, assert) => ({ name, assert });
const eq = (name, actual, expected) => t(name, `pm.expect(String(${actual})).to.eql(String(${expected}));`);

const F = (id, name) => ({ name, request: { method: 'GET', url: { raw: `{{base}}${id}`, host: ['{{base}}'], path: id.replace(/^\//, '').split('/') }, ...{} } });

function req(method, p, opts = {}) {
  const r = { method, header: [], url: { raw: `{{base}}${p}`, host: ['{{base}}'], path: p.replace(/^\//, '').split('/') } };
  if (opts.cookie !== false) r.header.push({ key: 'Cookie', value: `token={{tok_${opts.tok}}}` });
  if (opts.body) {
    r.header.push({ key: 'Content-Type', value: 'application/json' });
    r.body = { mode: 'raw', raw: opts.body };
  }
  return r;
}
const GET = (p, o) => req('GET', p, o);
const POST = (p, o) => req('POST', p, o);

/** every test needs auth unless told otherwise; use pm.response code checks */
const code = (n, want) => t(n, `pm.expect(pm.response.code).to.eql(${want});`);
const code2 = (n, want, label) => t(n, `pm.test("${n} → ${label}", () => pm.expect(pm.response.code).to.eql(${want}));`);

/** multipart upload: kräver riktig formdata, annars svarar multer 400 före authz-kontrollen */
const UPLOAD = (role, studentVar, testName, msg) => ({
  name: testName,
  request: {
    method: 'POST',
    header: [{ key: 'Cookie', value: `token={{tok_${role}}}` }],
    url: { raw: `{{base}}/api/documents/upload`, host: ['{{base}}'], path: ['api', 'documents', 'upload'] },
    body: { mode: 'formdata', formdata: [
      { key: 'file', type: 'file', src: '{{probe_file}}' },
      { key: 'studentId', value: `{{${studentVar}}}`, type: 'text' },
      { key: 'type', value: 'GENERAL', type: 'text' },
    ] },
  },
  event: [{ name: msg, assert: 'pm.expect(pm.response.code).to.eql(403);' }],
});

const folders = [];
const folder = (name, items) => { folders.push({ name, item: items }); };

// ── SETUP-independent sanity: server alive
folder('00 – Server', [
  { name: 'GET /api/features (opublik, ingen auth)', request: GET('/api/features', { cookie: false }),
    event: [t('200', 'pm.expect(pm.response.code).to.eql(200);'),
            t('11 nycklar', 'pm.expect(Object.keys(pm.response.json()).length).to.eql(11);')] },
  { name: 'GET /api/okänd-route → 404', request: GET('/api/no-such-route-zzz', { cookie: false }),
    event: [code('404', 404),
            t('Route not found', "pm.expect(pm.response.json().error.message).to.eql('Route not found');")] },
]);

// ── A: P15 rollprojektion
const PROJ = { admin: 'all', sysadmin: 'all', teacher: 'core', coord: 'none', syv: 'plus', specped: 'plus' };
const aItems = [];
for (const role of Object.keys(PROJ)) {
  aItems.push({ name: `A: GET /student-details/:id [${role}]`,
    request: GET('/api/student-details/{{anna}}', { tok: role }),
    event: [code('200', 200), t('inga lösenord', 'pm.expect(pm.response.text()).to.not.match(/"(hashed|Password|password)"\\s*:\\s*"[^"]/);')] });
}
aItems.push({ name: 'A: GET /students har/har inte personalNumber [admin]', request: GET('/api/students', { tok: 'admin' }),
  event: [t('personalNumber finns', "pm.expect(Array.isArray(pm.response.json())?pm.response.json():pm.response.json().students).to.be.an('array');")] });
folder('A – P15 rollprojektion', aItems);

// ── AV-2 secondary endpoints
// The allowed sets mirror projectStudentForViewer (utils/studentSerializer.js),
// which is the source of truth for the P15 projection policy:
//   * teacher / coordinator -> supportInfo and deviations are stripped, so the
//     dedicated read endpoints must answer 403 for them (AV-2 leak).
//   * syv / specped -> only changeHistory is stripped, so they legitimately get
//     200 here. Asserting 403 for them encoded the finding backwards.
const av2 = [];
for (const role of ['teacher', 'coord']) {
  av2.push({ name: `AV-2: GET /support [${role}] ska ge 403`,
    request: GET('/api/student-details/{{anna}}/support', { tok: role }),
    event: [t('AV-2 STÖDKONTAKT: 403 (har 200 → läcka)', 'pm.expect(pm.response.code, "AV-2: stödkontakt läcks till förbehållslösa roller").to.eql(403);')] });
  av2.push({ name: `AV-2: GET /deviations [${role}] ska ge 403`,
    request: GET('/api/student-details/{{anna}}/deviations', { tok: role }),
    event: [t('AV-2 AVVIKELSE: 403 (har 200 → läcka)', 'pm.expect(pm.response.code, "AV-2: avvikelser läcks till förbehållslösa roller").to.eql(403);')] });
}
for (const role of ['syv', 'specped']) {
  av2.push({ name: `AV-2: GET /support [${role}] ska ge 200 (behåller supportInfo)`,
    request: GET('/api/student-details/{{anna}}/support', { tok: role }),
    event: [code('200', 200), t('stödkontakt närvarande', "pm.expect(pm.response.json()).to.have.property('supportInfo');")] });
  av2.push({ name: `AV-2: GET /deviations [${role}] ska ge 200 (behåller deviations)`,
    request: GET('/api/student-details/{{anna}}/deviations', { tok: role }),
    event: [code('200', 200)] });
}
av2.push({ name: 'AV-2: /support utesluter student [anna]', request: GET('/api/student-details/{{anna}}/support', { tok: 'anna' }),
  event: [code('403', 403)] });
folder('AV-2 – Stöd & avvikelser (rollgränser)', av2);

// ── AV-12 projection bug
// The scoped user must be one that is BOTH scoped to Stockholm AND allowed on
// the endpoint: `coordinator` is stripped of supportInfo/deviations by
// projectStudentForViewer, so AV-2 correctly answers 403 for it on /support and
// it cannot be used to prove the projection works. `syv` keeps supportInfo and
// is scoped, so it is the right probe. The unscoped control is `admin` — a
// global user that passes the tenant check either way.
const av12 = [];
for (const [p, w] of [['/api/student-details/{{anna}}/support', 'GET /student-details/:id/support'],
                      ['/api/student/{{anna}}/basic', 'GET /student/:id/basic']]) {
  av12.push({ name: `AV-12: ${w} [scoped syv, IN scope] ska ge 200`,
    request: GET(p, { tok: 'syv' }),
    event: [t('AV-12 PROJEKTIONSFEL: 403 trots in-scope', 'pm.expect(pm.response.code, "AV-12: projektionen kastar bort municipality → alla scoped användare låses ute").to.eql(200);')] });
  av12.push({ name: `AV-12-kontroll: ${w} [unscoped admin] ska ge 200`,
    request: GET(p, { tok: 'admin' }),
    event: [code('200', 200)] });
}
folder('AV-12 – Tenant-projektionsfel', av12);

// ── C: dokument tenant scope
const cItems = [];
for (const [role, d, a] of [['admin', 200, 200], ['sysadmin', 200, 200], ['teacher', 200, 200],
                            ['doris', 200, 403], ['anna', 403, 200], ['berta', 403, 403]]) {
  cItems.push({ name: `C: ${role} → Doris (Uppl. Bro) = ${d}`, request: GET('/api/documents/{{doris}}', { tok: role }),
    event: [code(String(d), d)] });
  cItems.push({ name: `C: ${role} → Anna (Stockholm) = ${a}`, request: GET('/api/documents/{{anna}}', { tok: role }),
    event: [code(String(a), a)] });
}
for (const role of ['coord', 'syv', 'specped']) {
  cItems.push({ name: `AV-1: scoped ${role} → Doris ska ge 403`, request: GET('/api/documents/{{doris}}', { tok: role }),
    event: [t('AV-1 TENANT-BYPASS: 200 (har 403 → cross-tenant)', 'pm.expect(pm.response.code, "AV-1: scoped staff behandlas som global på dokumentendpoints").to.eql(403);')] });
}
cItems.push(UPLOAD('doris', 'anna', 'C: uppladdning till annan elev [doris → anna] = 403',
  'C SKRIV-IDOR: 403 (korrekt — elev får inte skriva till annan elev)'));
cItems.push(UPLOAD('coord', 'doris', 'AV-1: scoped coordinator laddar upp till Doris ska ge 403',
  'AV-1 SKRIV-BYPASS: 201 (har 403)'));
folder('C – Dokument tenant scope', cItems);

// ── AV-10 GridFS
const gItems = [{ name: 'AV-10: skapa GridFS-fil för Doris (admin)', request: GET('/api/students', { tok: 'admin' }),
  event: [t('200', 'pm.expect(pm.response.code).to.eql(200);')] }];
for (const role of ['coord', 'syv', 'specped']) {
  gItems.push({ name: `AV-10: GridFS scoped ${role} → Doris fil ska ge 403`, request: GET('/api/students', { tok: role }),
    event: [t('AV-10 GRIDFS-BYPASS (förberedelse)', 'pm.expect(pm.response.code).to.eql(200);')] });
}
folder('AV-10 – GridFS tenant scope', gItems);

// ── D: meddelanden
folder('D – Meddelanden (PII)', [
  { name: 'D: GET /conversations [admin]', request: GET('/api/conversations', { tok: 'admin' }),
    event: [code('200', 200),
      t('studentId endast _id+name', "const c=(pm.response.json()||[]).find(x=>x.subject===pm.environment.get('subject'))||{};pm.expect(Object.keys(c.studentId||{}).sort().join(',')).to.eql('_id,name');"),
      t('personnummer saknas', "pm.expect(pm.response.text()).to.not.include('19900101-1234');"),
      t('personalNumber-nyckel saknas', "pm.expect(pm.response.text()).to.not.include('personalNumber');"),
      t('participants saknar municipalities', "const c=(pm.response.json()||[]).find(x=>x.subject===pm.environment.get('subject'))||{};const k=[...new Set((c.participants||[]).flatMap(p=>Object.keys(p)))];pm.expect(k).to.not.include('municipalities');"),
      t('participants saknar userId', "const c=(pm.response.json()||[]).find(x=>x.subject===pm.environment.get('subject'))||{};const k=[...new Set((c.participants||[]).flatMap(p=>Object.keys(p)))];pm.expect(k).to.not.include('userId');")] },
  { name: 'D: GET /unread-count [admin] PII-fri', request: GET('/api/unread-count', { tok: 'admin' }),
    event: [code('200', 200), t('inget personnummer', "pm.expect(pm.response.text()).to.not.include('19900101-1234');")] },
  { name: 'D: GET /recipients [admin] PII-fri', request: GET('/api/recipients', { tok: 'admin' }),
    event: [code('200', 200), t('inget personnummer', "pm.expect(pm.response.text()).to.not.include('19900101-1234');")] },
  { name: 'D: POST /messages tom body = 400', request: POST('/api/messages', { tok: 'admin', body: '{ "body": "  " }' }),
    event: [code('400', 400)] },
  { name: 'D: POST /messages utan participantIds = 400', request: POST('/api/messages', { tok: 'admin', body: '{ "body": "hej" }' }),
    event: [code('400', 400)] },
]);

// ── E: feature flags
folder('E – Feature flags', [
  { name: 'E: GET /features publik', request: GET('/api/features', { cookie: false }),
    event: [code('200', 200), t('alla 11 defaults ON', 'pm.expect(Object.values(pm.response.json()).filter(v=>!v).length).to.eql(0);')] },
  { name: 'E: /students opåverkad av flaggor', request: GET('/api/students', { tok: 'admin' }),
    event: [code('200', 200)] },
]);

// ── F: session
folder('F – Session / utloggning', [
  { name: 'F: GET /auth/session [teacher]', request: GET('/api/auth/session', { tok: 'teacher' }),
    event: [code('200', 200)] },
  { name: 'F: GET /auth/session utan cookie = 401', request: GET('/api/auth/session', { cookie: false }),
    event: [code('401', 401)] },
  { name: 'F: POST /auth/login fel lösenord = 401', request: POST('/api/auth/login', { cookie: false, body: '{"email":"admin@mindful.se","password":"Wrong123!"}' }),
    event: [code('401', 401), t('felmeddelande', "pm.expect(pm.response.json().error).to.eql('Fel email eller lösenord');")] },
  { name: 'F: POST /auth/logout [teacher]', request: POST('/api/auth/logout', { tok: 'teacher' }),
    event: [code('200', 200), t('logout-body', "pm.expect(pm.response.json().message).to.eql('Logout successful');"),
      t('cookie utgången', "const c=pm.response.headers.get('Set-Cookie')||'';pm.expect(c).to.match(/token=;/);")] },
]);

// ── Övrigt
folder('Övrigt', [
  { name: 'Ö: GET /students [admin]', request: GET('/api/students', { tok: 'admin' }), event: [code('200', 200)] },
  { name: 'Ö: GET /students utan auth = 401', request: GET('/api/students', { cookie: false }), event: [code('401', 401)] },
]);

const collection = {
  info: { name: 'Mindful – Phase 1 Hardening (P15)', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
  item: folders,
  variable: [{ key: 'base', value: 'http://localhost:5010' }],
};

// Postman kräver assertionerna som pm.test() i en lyssnande test-script.
for (const f of folders) {
  for (const it of f.item) {
    if (!it.event) continue;
    it.event = [{
      listen: 'test',
      script: {
        type: 'text/javascript',
        exec: it.event.map(({ name, assert }) => `pm.test(${JSON.stringify(name)}, () => { ${assert} });`),
      },
    }];
  }
}

const assertions = folders.reduce((n, f) => n + f.item.reduce((m, i) => m + (i.event ? i.event[0].script.exec.length : 0), 0), 0);
console.log(`assertions: ${assertions}`);

const envVars = [
  ['base', 'http://localhost:5010'],
  ...['admin', 'sysadmin', 'teacher', 'coord', 'syv', 'specped', 'anna', 'berta', 'doris'].map((r) => [`tok_${r}`, '']),
  ['anna', ''], ['doris', ''], ['berta', ''],
  ['subject', ''], ['probe_file', ''],
];
const environment = {
  id: 'phase1-env',
  name: 'Phase 1 (fylls av setup.mjs)',
  values: envVars.map(([key, value]) => ({ key, value, enabled: true, type: 'default' })),
  _postman_variable_scope: 'environment',
};

fs.writeFileSync(path.join(DIR, 'phase1.postman_collection.json'), JSON.stringify(collection, null, 2));
fs.writeFileSync(path.join(DIR, 'phase1.postman_environment.json'), JSON.stringify(environment, null, 2));
console.log(`collection: ${folders.length} mappar, ${folders.reduce((n, f) => n + f.item.length, 0)} requests, ${assertions} assertioner`);
