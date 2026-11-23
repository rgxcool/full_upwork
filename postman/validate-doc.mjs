import fs from 'node:fs';
import { execSync } from 'node:child_process';

const FILE = process.argv[2] || 'docs/reports/PHASE1-HARDENING-TEST-PLAN.md';
const src = fs.readFileSync(FILE, 'utf8');
const lines = src.split('\n');
let bad = 0;
const fail = (m) => { console.log('  ✗ ' + m); bad++; };
const ok = (m) => console.log('  ✓ ' + m);

console.log(`Validering av ${FILE} (${lines.length} rader)\n`);

// 1. Alla fenced blocks måste öppna på egen rad och balansera.
const fences = lines.map((l, i) => [i + 1, l]).filter(([, l]) => /^\s*```/.test(l));
console.log('Fences');
{
  const inline = lines.map((l, i) => [i + 1, l]).filter(([, l]) => /```/.test(l) && !/^\s*```/.test(l));
  if (inline.length) fail(`fence mitt i en rad (renderas som text): ${inline.map(([n, l]) => `${n}: ${l.trim().slice(0, 40)}`).join(' | ')}`);
  else ok('inga fences mitt i rader');
  if (fences.length % 2) fail(`${fences.length} fence-rader — udda antal`);
  else ok(`${fences.length} fence-rader, balanserade`);
  let inb = false, st = 0;
  for (const [n, t] of fences) {
    if (!inb) { inb = true; st = n; }
    else { inb = false; if (t.trim() !== '```') fail(`stängande fence med info-sträng @${n} (öppnade ${st})`); }
  }
  if (inb) fail(`oavslutat block från rad ${st}`);
}

// 2. Alla bash-block ska parses av bash -n.
console.log('\nBash-block');
{
  let n = 0, errs = 0;
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*```bash\s*$/.test(lines[i])) continue;
    n++;
    let buf = '', j = i + 1;
    for (; j < lines.length && !/^\s*```/.test(lines[j]); j++) buf += lines[j] + '\n';
    if (!buf.trim()) { fail(`tomt bash-block @${i + 1}`); errs++; continue; }
    try { execSync('bash -n', { input: buf, stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch (e) { fail(`syntaxfel @${i + 1}: ${String(e.stderr).split('\n')[0]}`); errs++; }
  }
  if (!errs) ok(`${n} bash-block parsar utan fel`);
}

// 3. GitHub-sluggar: ta bort punktering utom - och _, varje blanksteg -> ett bindestreck.
console.log('\nAnkarlänkar');
{
  const slugs = new Set();
  for (const m of src.matchAll(/^#{1,6}[ \t]+(.*?)[ \t]*$/gm)) {
    slugs.add(m[1].toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-'));
  }
  const links = [...src.matchAll(/\]\(#([^)]+)\)/g)].map((m) => m[1]);
  const broken = [...new Set(links.filter((l) => !slugs.has(l)))];
  if (broken.length) fail(`${broken.length}/${links.length} trasiga: ${broken.join(' ')}`);
  else ok(`${links.length} ankarlänkar resolvear`);
}

// 4. Alla fil:line-sammanfattningar ska peka på befintliga filer och giltiga rader.
console.log('\nFilsammanfattningar');
{
  const index = new Map();
  const skip = new Set(['node_modules', '.git', 'dist', 'build', '.nuxt', 'coverage']);
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (skip.has(e.name)) continue;
      const p = d === '.' ? e.name : `${d}/${e.name}`;
      e.isDirectory() ? walk(p) : index.set(e.name, p);
    }
  })('.');

  const cits = [...src.matchAll(/`([\w./-]+\.(?:js|vue|mjs)):(\d+)(?:-(\d+))?`/g)];
  let good = 0;
  for (const c of cits) {
    const name = c[1].split('/').pop();
    let hit = index.get(c[1]) || index.get(name);
    if (!hit) { fail(`filen finns inte i repot: ${c[1]}`); continue; }
    const n = fs.readFileSync(hit, 'utf8').split('\n').length;
    const end = +(c[3] || c[2]);
    if (end > n) fail(`${hit}: rad ${end} finns inte (filen har ${n})`);
    else good++;
  }
  ok(`${good}/${cits.length} giltiga`);
}

// 5. Tabeller utanför kodblock ska ha konsekvent antal kolumner och header-separator.
console.log('\nTabeller');
{
  const inCode = new Array(lines.length).fill(false);
  let inb = false;
  lines.forEach((l, i) => {
    if (/^\s*```/.test(l)) inb = !inb;
    inCode[i] = inb;
  });
  let t = 0, errs = 0, cols = 0;
  for (let i = 0; i < lines.length; i++) {
    if (inCode[i] || !/^\s*\|/.test(lines[i])) { cols = 0; continue; }
    const c = (lines[i].match(/\|/g) || []).length;
    if (!cols) {
      cols = c; t++;
      const sep = lines[i + 1] || '';
      if (!inCode[i + 1] && !/^\s*\|[\s:|-]+\|\s*$/.test(sep)) {
        fail(`tabellrad @${i + 1} saknar header-separator: ${lines[i].trim().slice(0, 46)}`);
        errs++;
      }
    } else if (c !== cols) { fail(`tabell @${i + 1} har ${c} streck, förväntat ${cols}`); errs++; }
  }
  if (!errs) ok(`${t} tabeller med konsekventa kolumner`);
}

console.log(bad ? `\n${bad} problem` : '\nInga problem');
process.exit(bad ? 1 : 0);
