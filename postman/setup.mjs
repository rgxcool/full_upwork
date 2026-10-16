import fs from 'node:fs';
import path from 'node:path';
import { MongoClient } from 'mongodb';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const BASE = process.env.BASE_URL || 'http://localhost:5010';
const MONGO = process.env.MONGO_URL || 'mongodb://localhost:27018/mindfullearning';
const RUN = process.env.RUN_ID || String(Date.now());
const SUBJECT = `P15 Verifiering ${RUN}`;

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

// Kommun per elev så att tenant-scope går att verifiera överhuvudtaget.
const MUNI = {
  'Anna Andersson': 'Stockholm', 'Berta Berg': 'Stockholm', 'Calle Carlsson': 'Stockholm',
  'Erik Ek': 'Stockholm', 'Doris Dahl': 'Upplands Bro',
};

async function login(a) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: a.email, password: a.password }),
  });
  if (!r.ok) throw new Error(`login ${a.email}: ${r.status}`);
  const c = r.headers.getSetCookie().find((x) => x.startsWith('token='));
  if (!c) throw new Error(`no token for ${a.email}`);
  return c.split(';')[0].split('=')[1];
}

const mongo = new MongoClient(MONGO);
await mongo.connect();
const db = mongo.db();
const S = db.collection('students');

const students = await S.find({}).toArray();
const byName = Object.fromEntries(students.map((s) => [s.name, s._id.toString()]));

// Snapshot the pre-run municipality per student so teardown can restore the
// exact original state (see teardown.mjs) instead of unsetting the field.
const municipalitySnapshot = students.map((s) => ({ id: String(s._id), municipality: s.municipality ?? null }));

// AV-9: the seed writes municipality as a plain string; the schema wants { type }.
const hadMuni = Object.values(Object.fromEntries(students.map((s) => [s.name, s.municipality])))
  .some((m) => m && m.type);
for (const [name, m] of Object.entries(MUNI)) await S.updateOne({ name }, { $set: { municipality: { type: m } } });

// The "scoped staff" trio. All three get the SAME single-municipality scope so
// the cross-tenant assertions (AV-1, AV-12) are meaningful for each of them —
// an unscoped user is global by definition and would legitimately get 200.
const SCOPED_STAFF = ['coordinator@mindful.se', 'syv@mindful.se', 'specped@mindful.se'];
const scopedIds = [];
for (const email of SCOPED_STAFF) {
  const u = await db.collection('users').findOne({ email });
  if (!u) throw new Error(`scoped staff user missing: ${email}`);
  await db.collection('users').updateOne({ _id: u._id }, { $set: { municipalities: ['Stockholm'] } });
  scopedIds.push(String(u._id));
}
await S.updateOne({ name: 'Anna Andersson' }, { $set: { supportInfo: [
  { contactName: 'Kurator Sara', contactRole: 'Kurator', contactEmail: 'sara@example.se', supportType: 'kurator' }] } });

// JWT bär inte municipalities → logga in om efter att scopen sattes.
const tokens = {};
for (const [k, a] of Object.entries(ACCOUNTS)) tokens[`tok_${k}`] = await login(a);

// Fysisk fil för multipart-testerna (multer avvisar annars med 400).
const PROBE_FILE = path.join(DIR, '.probe.txt');
fs.writeFileSync(PROBE_FILE, `p15-probe-${RUN}\n`);

// Skapa konversationen som D-testerna läser.
const annaUser = await db.collection('users').findOne({ email: 'student@mindful.se' });
const cr = await fetch(`${BASE}/api/messages`, {
  method: 'POST',
  headers: { cookie: `token=${tokens.tok_admin}`, 'content-type': 'application/json' },
  body: JSON.stringify({ participantIds: [annaUser._id.toString()], studentId: byName['Anna Andersson'],
    subject: SUBJECT, body: 'Hej Anna, detta är ett P15-testmeddelande.' }),
});
if (cr.status !== 201) throw new Error(`create conversation: ${cr.status} ${await cr.text()}`);

const env = {
  id: 'phase1-env',
  name: 'Phase 1 (fylls av setup.mjs)',
  values: [
    { key: 'base', value: BASE, enabled: true, type: 'default' },
    ...Object.entries(tokens).map(([key, value]) => ({ key, value, enabled: true, type: 'secret' })),
    { key: 'anna', value: byName['Anna Andersson'], enabled: true, type: 'default' },
    { key: 'berta', value: byName['Berta Berg'], enabled: true, type: 'default' },
    { key: 'doris', value: byName['Doris Dahl'], enabled: true, type: 'default' },
    { key: 'subject', value: SUBJECT, enabled: true, type: 'default' },
    { key: 'probe_file', value: PROBE_FILE, enabled: true, type: 'default' },
  ],
  _postman_variable_scope: 'environment',
};
fs.writeFileSync(path.join(DIR, 'phase1.postman_environment.json'), JSON.stringify(env, null, 2));
fs.writeFileSync(path.join(DIR, '.run-state.json'), JSON.stringify({ subject: SUBJECT, hadMuni, scopedIds, municipalitySnapshot }, null, 2));

console.log(`setup: ${Object.keys(tokens).length} tokens, ${students.length} elever, kommun-mappad=${!hadMuni}`);
console.log(`  subject="${SUBJECT}"; scoped staff: ${SCOPED_STAFF.join(', ')}`);
if (!hadMuni) console.log('  VARNING AV-9: seeden innehöll ingen municipality.type (reparerad för testet)');
await mongo.close();
