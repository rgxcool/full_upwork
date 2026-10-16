import fs from 'node:fs';
import path from 'node:path';
import { MongoClient } from 'mongodb';

const BASE = process.env.BASE_URL || 'http://localhost:5010';
const MONGO = process.env.MONGO_URL || 'mongodb://localhost:27018/mindfullearning';
const DIR = path.dirname(new URL(import.meta.url).pathname);
const RUN = process.env.RUN_ID || String(Date.now());

const R = [];
let folder = '';

function rec(name, actual, cls, detail = '') {
  R.push({ folder, name, actual, cls, detail });
  const mark = cls === 'PASS' ? ' PASS ' : cls === 'FAIL' ? '*FAIL*' : ' INFO ';
  console.log(`[${mark}] ${String(actual).padEnd(28)} ${name}${detail ? `  — ${detail}` : ''}`);
}
const pass = (n, a, d) => rec(n, a, 'PASS', d);
const fail = (n, a, d) => rec(n, a, 'FAIL', d);
const info = (n, a, d) => rec(n, a, 'INFO', d);

function eq(name, actual, expected) {
  const ok = String(actual) === String(expected);
  ok ? pass(name, actual) : fail(name, actual, `expected ${expected}`);
  return ok;
}
function is403(name, actual, spec = 403) {
  actual === spec ? pass(name, actual) : fail(name, actual, `spec ${spec} — AV`);
  return actual === spec;
}
function must(name, cond, detail = '') {
  cond ? pass(name, 'ok', detail) : fail(name, 'violated', detail);
  return !!cond;
}
function inSet(name, actual, allowed) {
  allowed.map(String).includes(String(actual))
    ? pass(name, actual) : fail(name, actual, `expected one of ${allowed.join('|')}`);
  return allowed.map(String).includes(String(actual));
}

async function req(method, p, { token, body, form, headers = {} } = {}) {
  const h = { ...headers };
  if (token) h.cookie = `token=${token}`;
  if (body) h['content-type'] = 'application/json';
  const res = await fetch(`${BASE}${p}`, {
    method, headers: h,
    body: form || (body ? JSON.stringify(body) : undefined),
    redirect: 'manual',
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { /* non-json */ }
  return { status: res.status, json, text, cookies: res.headers.getSetCookie?.() || [] };
}

async function login(a) {
  const r = await req('POST', '/api/auth/login', { body: { email: a.email, password: a.password } });
  if (r.status !== 200) throw new Error(`login ${a.email}: ${r.status} ${r.text.slice(0, 160)}`);
  const c = r.cookies.find((x) => x.startsWith('token='));
  if (!c) throw new Error(`no token cookie for ${a.email}`);
  return { ...a, token: c.split(';')[0].split('=')[1] };
}

const ACCOUNTS = {
  admin:   { email: 'admin@mindful.se',       password: 'Admin123!' },
  sysadmin:{ email: 'sysadmin@mindful.se',    password: 'Admin123!' },
  teacher: { email: 'teacher@mindful.se',     password: 'Teacher123!' },
  coord:   { email: 'coordinator@mindful.se', password: 'Teacher123!' },
  syv:     { email: 'syv@mindful.se',         password: 'Teacher123!' },
  specped: { email: 'specped@mindful.se',     password: 'Teacher123!' },
  anna:    { email: 'student@mindful.se',     password: 'Student123!' },
  berta:   { email: 'student2@mindful.se',    password: 'Student123!' },
  doris:   { email: 'student4@mindful.se',    password: 'Student123!' },
};

async function main() {
  const mongo = new MongoClient(MONGO);
  await mongo.connect();
  const db = mongo.db();
  const S = () => db.collection('students');

  folder = 'SETUP';
  const L = {};
  for (const [k, a] of Object.entries(ACCOUNTS)) L[k] = await login(a);
  pass('inloggning 9 roller', '200', Object.keys(L).length + ' roller');

  const students = await S().find({}).toArray();
  const byName = Object.fromEntries(students.map((s) => [s.name, s._id.toString()]));
  const { 'Doris Dahl': DORIS, 'Anna Andersson': ANNA, 'Berta Berg': BERTA } = byName;

  // --- AV-9: does seed data carry a usable municipality? ---
  const muniSnapshot = students.map((s) => ({ id: String(s._id), municipality: s.municipality ?? null }));
  const rawMuni = Object.fromEntries(students.map((s) => [s.name, s.municipality]));
  const anyMuni = Object.values(rawMuni).some((m) => m && m.type);
  anyMuni
    ? pass('AV-9: elever har municipality.type', 'ja')
    : fail('AV-9: elever har municipality.type', 'saknas',
        `municipality på alla elever = ${JSON.stringify(Object.values(rawMuni)[0])} — tenant-scope går inte att verifiera`);

  // Repair the fixture so the tenant tests are meaningful at all.
  const MUNI = { 'Anna Andersson': 'Stockholm', 'Berta Berg': 'Stockholm',
                 'Calle Carlsson': 'Stockholm', 'Erik Ek': 'Stockholm', 'Doris Dahl': 'Upplands Bro' };
  for (const [name, m] of Object.entries(MUNI)) {
    await S().updateOne({ name }, { $set: { municipality: { type: m } } });
  }
  info('fixture: municipality satt', 'Stockholm×4 / Upplands Bro×1', 'reparerar AV-9 inför C-testerna');

  // The "scoped staff" trio all get the SAME single-municipality scope, so the
  // cross-tenant assertions (AV-1, AV-10, AV-12) are meaningful for each of
  // them. An unscoped user is global by definition and would correctly get 200,
  // which would make the "must be 403" checks vacuous.
  const SCOPED_STAFF = ['coordinator@mindful.se', 'syv@mindful.se', 'specped@mindful.se'];
  const scopedIds = [];
  for (const email of SCOPED_STAFF) {
    const u = await db.collection('users').findOne({ email });
    await db.collection('users').updateOne({ _id: u._id }, { $set: { municipalities: ['Stockholm'] } });
    scopedIds.push(u._id);
  }
  for (const k of ['coord', 'syv', 'specped']) L[k] = await login(ACCOUNTS[k]);  // JWT bär inte municipalities
  pass('§3.1 coordinator+syv+specped scoped till Stockholm', 'ok');

  await S().updateOne({ name: 'Anna Andersson' }, { $set: { supportInfo: [
    { contactName: 'Kurator Sara', contactRole: 'Kurator', contactEmail: 'sara@example.se', supportType: 'kurator' }] } });
  pass('§3.3 stödkontakt på Anna', 'ok');

  // ═══ A. P15 ═══════════════════════════════════════════════════════════════
  folder = 'A — P15 rollprojektion';
  // deviations is NOT a Student field (separate Deviation collection) — exclude it.
  const FIELDS = ['personalNumber', 'specialNeeds', 'supportInfo', 'examAccommodations', 'commentHistory', 'changeHistory'];
  const WANT = {
    admin:    FIELDS,
    sysadmin: FIELDS,
    teacher:  ['personalNumber', 'specialNeeds', 'examAccommodations', 'commentHistory'],
    coord:    [],
    syv:      ['personalNumber', 'specialNeeds', 'supportInfo', 'examAccommodations', 'commentHistory'],
    specped:  ['personalNumber', 'specialNeeds', 'supportInfo', 'examAccommodations', 'commentHistory'],
  };
  for (const role of Object.keys(WANT)) {
    const r = await req('GET', `/api/student-details/${ANNA}`, { token: L[role].token });
    eq(`A: GET /student-details/:id [${role}]`, r.status, 200);
    const s = r.json?.student || r.json || {};
    const present = FIELDS.filter((f) => f in s);
    JSON.stringify(present) === JSON.stringify(WANT[role])
      ? pass(`A: projektion [${role}]`, present.join(',') || '(inga)')
      : fail(`A: projektion [${role}]`, present.join(',') || '(inga)', `expected ${WANT[role].join(',') || '(inga)'}`);
    must(`A: inga lösenord [${role}]`, !/"(hashed|password|Password)"\s*:\s*"[^"]/.test(r.text));
  }
  for (const [role, want] of [['admin', true], ['teacher', true], ['coord', false]]) {
    const r = await req('GET', '/api/students', { token: L[role].token });
    const arr = Array.isArray(r.json) ? r.json : r.json?.students || [];
    const has = arr.some((s) => 'personalNumber' in s);
    has === want ? pass(`A: /students har personalNumber [${role}]`, has) : fail(`A: /students har personalNumber [${role}]`, has, `expected ${want}`);
  }
  const cl = await req('GET', '/api/students', { token: L.coord.token });
  const ca = Array.isArray(cl.json) ? cl.json : cl.json?.students || [];
  const leak = ca.filter((s) => s.municipality?.type && s.municipality.type !== 'Stockholm');
  leak.length === 0 ? pass('C-4: scoped coordinator ser bara Stockholm', `${ca.length} elever`) : fail('C-4: scoped coordinator ser bara Stockholm', `${ca.length} elever`, `läckt: ${leak.map(s=>s.name)}`);

  // AV-2 — secondary endpoints. The allowed sets mirror
  // projectStudentForViewer (utils/studentSerializer.js), the source of truth for
  // the P15 projection policy: teacher/coordinator are stripped of supportInfo and
  // deviations (so 403), while syv/specped keep them (so 200).
  for (const role of ['teacher', 'coord']) {
    const sup = await req('GET', `/api/student-details/${ANNA}/support`, { token: L[role].token });
    const dev = await req('GET', `/api/student-details/${ANNA}/deviations`, { token: L[role].token });
    is403(`AV-2: GET /support [${role}]`, sup.status);
    is403(`AV-2: GET /deviations [${role}]`, dev.status);
  }
  for (const role of ['syv', 'specped']) {
    eq(`AV-2: GET /support [${role}] behåller supportInfo → 200`,
      (await req('GET', `/api/student-details/${ANNA}/support`, { token: L[role].token })).status, 200);
    eq(`AV-2: GET /deviations [${role}] → 200`,
      (await req('GET', `/api/student-details/${ANNA}/deviations`, { token: L[role].token })).status, 200);
  }
  for (const role of ['anna', 'coord']) {
    eq(`AV-2: /support uteslut student [${role}]`, (await req('GET', `/api/student-details/${ANNA}/support`, { token: L[role].token })).status, 403);
  }
  // AV-12 — projektionen kastar bort municipality, så tenant-kontrollen kan aldrig passera.
  // Korrekt beteende för en scoped användare på en IN-scope-elev är 200 — därför eq mot 200.
  // The probe must be scoped AND allowed on the endpoint. `coord` is stripped of
  // supportInfo by the serializer, so AV-2 correctly 403s it on /support;
  // `syv` keeps supportInfo and is scoped, so it proves the projection works.
  // The control is `admin`, a global user that passes the tenant check anyway.
  for (const [p, what] of [[`/api/student-details/${ANNA}/support`, 'GET /student-details/:id/support'],
                           [`/api/student/${ANNA}/basic`, 'GET /student/:id/basic']]) {
    eq(`AV-12: ${what} [scoped syv, IN scope] ska ge 200`, (await req('GET', p, { token: L.syv.token })).status, 200);
    const unscoped = await req('GET', p, { token: L.admin.token });
    eq(`AV-12-kontroll: ${what} [unscoped admin]`, unscoped.status, 200);
  }

  // ═══ B. Uploads IDOR ══════════════════════════════════════════════════════
  folder = 'B — Uploads IDOR';
  const probe = `idor-probe-${RUN}`;
  const mkfile = (name) => { const f = new FormData(); f.append('file', new Blob([probe]), name); return f; };
  const upDoc = new FormData();
  upDoc.append('file', new Blob([probe]), 'probe.txt');
  upDoc.append('studentId', DORIS);
  upDoc.append('type', 'GENERAL');
  const up = await req('POST', '/api/documents/upload', { token: L.admin.token, form: upDoc });
  eq('B: POST /documents/upload', up.status, 201);
  const F = up.json?.filename;
  must('B: filnamn = timestamp-random-original', /^\d{13}-\d{9}-probe\.txt$/.test(F || ''), F);
  const meta = await req('GET', `/api/documents/${DORIS}`, { token: L.admin.token });
  eq('B/C: GET /documents/:id [admin]', meta.status, 200);
  const DOC = meta.json?.[0]?._id;

  eq('B: /uploads okänt filnamn', (await req('GET', '/uploads/nope-xyz.pdf', { token: L.admin.token })).status, 404);
  const tv = await req('GET', '/uploads/..%2F..%2F..%2Fetc%2Fpasswd', { token: L.admin.token });
  eq('B: path traversal -> 404 (AV-3)', tv.status, 404);
  eq('B: traversal-body', tv.json?.error, 'File not found');
  eq('B: ingen cookie', (await req('GET', `/uploads/${F}`)).status, 401);
  eq('B: ogiltig cookie', (await req('GET', `/uploads/${F}`, { token: 'garbage' })).status, 401);
  for (const [role, want] of [['admin', 200], ['teacher', 200], ['doris', 200], ['anna', 403], ['berta', 403]]) {
    const r = await req('GET', `/uploads/${F}`, { token: L[role].token });
    eq(`B: GET /uploads [${role}]`, r.status, want);
    if (want === 403) must(`B: 403 läcker inget innehåll [${role}]`, !r.text.includes(probe));
  }

  // GridFS
  eq('Ö: /uploads/<fil> admin (före radering)', (await req('GET', `/uploads/${F}`, { token: L.admin.token })).status, 200);
  const gfd = new FormData();
  gfd.append('file', new Blob([probe]), 'grid.txt');
  gfd.append('studentId', DORIS);
  const gup = await req('POST', `/api/uploads/${DORIS}`, { token: L.admin.token, form: gfd });
  eq('B: POST /uploads/:studentId (GridFS)', gup.status, 200);
  const G = gup.json?.file?._id;
  must('B: GridFS svarar {file:{_id}}', !!G, JSON.stringify(gup.json).slice(0, 80));
  if (G) {
    eq('B: GridFS egen elev', (await req('GET', `/api/uploads/download/${G}`, { token: L.doris.token })).status, 200);
    eq('B: GridFS annan elev', (await req('GET', `/api/uploads/download/${G}`, { token: L.anna.token })).status, 403);
  }

  // ═══ C. Dokument tenant scope ═════════════════════════════════════════════
  folder = 'C — Dokument-metadata tenant scope';
  for (const [role, d, a] of [
    ['admin', 200, 200], ['sysadmin', 200, 200], ['teacher', 200, 200],
    ['doris', 200, 403], ['anna', 403, 200], ['berta', 403, 403],
  ]) {
    eq(`C: ${role} -> Doris (Uppl. Bro)`, (await req('GET', `/api/documents/${DORIS}`, { token: L[role].token })).status, d);
    eq(`C: ${role} -> Anna (Stockholm)`, (await req('GET', `/api/documents/${ANNA}`, { token: L[role].token })).status, a);
  }
  for (const role of ['coord', 'syv', 'specped']) {
    is403(`AV-1: scoped ${role} -> Doris`, (await req('GET', `/api/documents/${DORIS}`, { token: L[role].token })).status);
    eq(`AV-1: ${role} -> Anna (in scope)`, (await req('GET', `/api/documents/${ANNA}`, { token: L[role].token })).status, 200);
  }
  const badUp = new FormData();
  badUp.append('file', new Blob([probe]), 'x.txt'); badUp.append('studentId', ANNA); badUp.append('type', 'GENERAL');
  eq('C: uppladdning till annan elev', (await req('POST', '/api/documents/upload', { token: L.doris.token, form: badUp })).status, 403);
  const scopedUp = new FormData();
  scopedUp.append('file', new Blob([probe]), 'x.txt'); scopedUp.append('studentId', DORIS); scopedUp.append('type', 'GENERAL');
  is403('AV-1: scoped coordinator laddar upp till Doris', (await req('POST', '/api/documents/upload', { token: L.coord.token, form: scopedUp })).status);
  if (DOC) {
    eq('C: icke-ägaren raderar', (await req('DELETE', `/api/documents/${DOC}`, { token: L.doris.token })).status, 403);
    eq('C: ägaren raderar', (await req('DELETE', `/api/documents/${DOC}`, { token: L.admin.token })).status, 200);
  }
  // AV-10 — GridFS checkFileAccess has no tenant check for staff
  if (G) {
    for (const role of ['coord', 'syv', 'specped']) {
      is403(`AV-10: GridFS scoped ${role} -> Doris fil`, (await req('GET', `/api/uploads/download/${G}`, { token: L[role].token })).status);
    }
  }

  // ═══ D. Meddelanden ═══════════════════════════════════════════════════════
  folder = 'D — Meddelanden (PII)';
  const annaUser = await db.collection('users').findOne({ email: 'student@mindful.se' });
  const c0 = await req('POST', '/api/messages', { token: L.admin.token, body: {
    participantIds: [annaUser._id.toString()], studentId: ANNA, subject: 'P15 Verifiering', body: 'Hej Anna, detta är ett P15-testmeddelande.' } });
  eq('D: POST /messages (skapa)', c0.status, 201);
  const list = await req('GET', '/api/conversations', { token: L.admin.token });
  eq('D: GET /conversations', list.status, 200);
  const mine = (list.json || []).find((c) => c.subject === 'P15 Verifiering');
  const CONV = mine?._id;
  must('D: konversation hittad', !!CONV, String(CONV));
  const sids = Object.keys(mine?.studentId || {}).sort();
  JSON.stringify(sids) === '["_id","name"]' ? pass('D: studentId = endast _id+name', sids.join(',')) : fail('D: studentId = endast _id+name', sids.join(','), 'förväntat _id,name');
  must('D: personnummer saknas i svaret', !list.text.includes('19900101-1234'));
  must('D: personalNumber-nyckel saknas', !list.text.includes('personalNumber'));
  const parts = mine?.participants || [];
  const partKeys = [...new Set(parts.flatMap((p) => Object.keys(p)))].sort();
  must('D: participants saknar municipalities', !partKeys.includes('municipalities'), `nycklar: ${partKeys.join(',')}`);
  must('D: participants saknar userId', !partKeys.includes('userId'), `nycklar: ${partKeys.join(',')}`);
  info('D: conversations.municipalities finns (avsiktligt tenant-fält)', 'ok', 'Conversation.municipalities, ej PII');
  for (const ep of ['/api/unread-count', '/api/recipients']) {
    const r = await req('GET', ep, { token: L.admin.token });
    r.status === 200 && !r.text.includes('19900101-1234') ? pass(`D: ${ep} PII-fri`, '200') : fail(`D: ${ep} PII-fri`, r.status);
  }
  if (CONV) {
    eq('D: POST /messages (svar i tråd)', (await req('POST', '/api/messages', { token: L.admin.token, body: { conversationId: CONV, body: 'Tack, mötet bokas inom kort.' } })).status, 201);
    eq('D: tom body -> 400', (await req('POST', '/api/messages', { token: L.admin.token, body: { conversationId: CONV, body: '  ' } })).status, 400);
    eq('D: utan participantIds -> 400', (await req('POST', '/api/messages', { token: L.admin.token, body: { body: 'hej' } })).status, 400);
    eq('D: icke-deltagare läser tråd', (await req('GET', `/api/conversations/${CONV}/messages`, { token: L.syv.token })).status, 404);
    const msgs = await req('GET', `/api/conversations/${CONV}/messages`, { token: L.admin.token });
    eq('D: deltagare läser tråd', msgs.status, 200);
    const n = msgs.json?.messages?.length;
    n === 2 ? pass('D: 2 meddelanden i tråden', n) : fail('D: 2 meddelanden i tråden', n, JSON.stringify(msgs.json).slice(0, 120));
  }

  // ═══ E. Feature flags ══════════════════════════════════════════════════════
  folder = 'E — Feature flags';
  const feat = await req('GET', '/api/features');
  eq('E: GET /features publik', feat.status, 200);
  const KEYS = ['MESSAGING','CERTIFICATES','FAQ','LMS','APL','PROVNINGAR','INACTIVITY','ANALYTICS','QUESTION_BANK','ACTION_PLANS','APPOINTMENTS'];
  eq('E: antal nycklar', Object.keys(feat.json || {}).length, 11);
  must('E: exakt rätt nyckeluppsättning', KEYS.every((k) => k in (feat.json || {})) && Object.keys(feat.json).length === 11);
  const offDef = Object.entries(feat.json || {}).filter(([, v]) => !v).map(([k]) => k);
  offDef.length === 0 ? pass('E: alla defaults ON', '11/11') : fail('E: alla defaults ON', offDef.join(','), 'icke-tom lista');
  const unknown = await req('GET', '/api/no-such-route-zzz');
  eq('E: okänd route -> 404', unknown.status, 404);
  eq('E: okänd route-body', unknown.json?.error?.message, 'Route not found');
  const GATED = [['MESSAGING','/api/conversations'],['CERTIFICATES','/api/certificates/settings'],
    ['FAQ','/api/chatbot/faq/categories'],['LMS','/api/learning/submissions/pending'],
    ['PROVNINGAR','/api/exams'],['INACTIVITY','/api/inactivity/report'],
    ['ANALYTICS','/api/analytics/filters'],['QUESTION_BANK','/api/question-bank/'],['APPOINTMENTS','/api/meetings']];
  const bad = [];
  for (const [flag, p] of GATED) {
    const r = await req('GET', p, { token: L.admin.token });
    if (r.status === 404 && r.json?.error?.message === 'Route not found') bad.push(`${flag}:${p}`);
  }
  bad.length === 0 ? pass('E: 9 flaggade sub-routes ≠ "Route not found" (ON)', '9/9') : fail('E: flaggade sub-routes', bad.join(' '), 'felaktigt path i guiden');
  eq('E: /students opåverkad av flaggor', (await req('GET', '/api/students', { token: L.admin.token })).status, 200);

  // ═══ F. Session ═══════════════════════════════════════════════════════════
  folder = 'F — Session / utloggning';
  const sess = await req('GET', '/api/auth/session', { token: L.teacher.token });
  eq('F: GET /auth/session', sess.status, 200);
  eq('F: session role', sess.json?.role || sess.json?.user?.role, 'teacher');
  eq('F: session utan cookie', (await req('GET', '/api/auth/session')).status, 401);
  const badLogin = await req('POST', '/api/auth/login', { body: { email: 'admin@mindful.se', password: 'Wrong123!' } });
  eq('F: fel lösenord', badLogin.status, 401);
  eq('F: felmeddelande', badLogin.json?.error, 'Fel email eller lösenord');
  const tw = await login(ACCOUNTS.berta);
  const lo = await req('POST', '/api/auth/logout', { token: tw.token });
  eq('F: logout', lo.status, 200);
  eq('F: logout-body', lo.json?.message, 'Logout successful');
  const clear = lo.cookies.find((c) => c.startsWith('token=;'));
  must('F: logout uttrycker cookie som utgången', !!clear && /Expires=Thu, 01 Jan 1970/.test(clear), clear || 'ingen Set-Cookie');
  const replay = await req('GET', '/api/auth/session', { token: tw.token });
  replay.status === 200
    ? info('F: JWT är stateless — återuppspelbart efter logout', '200',
        'AV-11: ingen server-side revocation.-cookies rensas korrekt, men token gäller 7d')
    : pass('F: token ogiltig efter logout', replay.status);

  folder = 'ÖVRIGT';
  eq('Ö: /students admin', (await req('GET', '/api/students', { token: L.admin.token })).status, 200);
  eq('Ö: /students utan auth', (await req('GET', '/api/students')).status, 401);
  // serveUpstream kräver Document-rad -> efter radering ska filen vara otillgänglig
  eq('Ö: /uploads/<fil> 404 efter att metadata raderats', (await req('GET', `/uploads/${F}`, { token: L.admin.token })).status, 404);

  // cleanup — restore the exact pre-run municipality per student. A blanket
  // $unset would destroy correct seed data and fail AV-9 on the next run.
  for (const id of scopedIds) await db.collection('users').updateOne({ _id: id }, { $set: { municipalities: [] } });
  for (const { id, municipality } of muniSnapshot) {
    if (municipality === null || municipality === undefined) {
      await S().updateOne({ _id: new (await import('mongodb')).ObjectId(id) }, { $unset: { municipality: '' } });
    } else {
      await S().updateOne({ _id: new (await import('mongodb')).ObjectId(id) }, { $set: { municipality } });
    }
  }
  await db.collection('conversations').deleteMany({ subject: 'P15 Verifiering' });
  await mongo.close();
  info('cleanup', 'ok', 'scope, municipality och testkonversationer återställda');

  const P = R.filter((x) => x.cls === 'PASS').length;
  const F2 = R.filter((x) => x.cls === 'FAIL').length;
  const I = R.filter((x) => x.cls === 'INFO').length;
  console.log('\n' + '='.repeat(96));
  console.log(`  PASS ${P}    FAIL ${F2}    INFO ${I}    TOTAL ${R.length}`);
  console.log('='.repeat(96));
  const byF = {};
  for (const r of R.filter((x) => x.cls === 'FAIL')) (byF[r.folder] ||= []).push(`${r.name} (fick ${r.actual}) ${r.detail}`);
  for (const [f, items] of Object.entries(byF)) {
    console.log(`\n${f}`);
    for (const i of items) console.log(`   * ${i}`);
  }
  fs.writeFileSync(path.join(DIR, 'results.json'),
    JSON.stringify({ base: BASE, at: new Date().toISOString(), pass: P, fail: F2, info: I, results: R }, null, 2));
  console.log(`\n-> ${path.join(DIR, 'results.json')}`);
  process.exit(F2 ? 1 : 0);
}
main().catch((e) => { console.error('FATAL', e); process.exit(2); });
