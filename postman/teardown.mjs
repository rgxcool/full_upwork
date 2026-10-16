import fs from 'node:fs';
import path from 'node:path';
import { MongoClient } from 'mongodb';

const DIR = path.dirname(new URL(import.meta.url).pathname);
const MONGO = process.env.MONGO_URL || 'mongodb://localhost:27018/mindfullearning';
const state = JSON.parse(fs.readFileSync(path.join(DIR, '.run-state.json'), 'utf8'));

const mongo = new MongoClient(MONGO);
await mongo.connect();
const db = mongo.db();

const { ObjectId } = await import('mongodb');
for (const id of state.scopedIds) await db.collection('users').updateOne({ _id: new ObjectId(id) }, { $set: { municipalities: [] } });

// Restore the exact pre-run municipality per student instead of unsetting the
// field on every document: a blanket $unset destroys real seed data whenever
// the seed is correct, which then fails AV-9 on the next run.
const S = db.collection('students');
for (const { id, municipality } of state.municipalitySnapshot || []) {
    if (municipality === null || municipality === undefined) {
        await S.updateOne({ _id: new ObjectId(id) }, { $unset: { municipality: '' } });
    } else {
        await S.updateOne({ _id: new ObjectId(id) }, { $set: { municipality } });
    }
}

// Delete this run's conversation, plus any orphan left by a previous run that
// was interrupted before its teardown (subjects carry a run-id suffix).
await db.collection('conversations').deleteMany({ subject: { $regex: '^P15 Verifiering' } });
await mongo.close();

fs.rmSync(path.join(DIR, '.run-state.json'), { force: true });
fs.rmSync(path.join(DIR, '.probe.txt'), { force: true });

// Nollställ session-token ur miljöfilen — den får aldrig lämna giltiga credentials på disk.
const envPath = path.join(DIR, 'phase1.postman_environment.json');
if (fs.existsSync(envPath)) {
  const env = JSON.parse(fs.readFileSync(envPath, 'utf8'));
  for (const v of env.values || []) if (v.key.startsWith('tok_')) v.value = '';
  fs.writeFileSync(envPath, JSON.stringify(env, null, 2));
}

console.log('teardown: scope, municipality och testkonversationer återställda; tokens nollställda');
