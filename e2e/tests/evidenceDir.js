// Where e2e specs write evidence screenshots and generated upload files.
// Default: e2e/test-results/evidence (git-ignored), so a normal run never
// touches tracked files. Set UPDATE_EVIDENCE=1 (`pnpm test:evidence`) to
// refresh the committed evidence in e2e/verification-screenshots on purpose.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const EVIDENCE_DIR =
  process.env.UPDATE_EVIDENCE === '1'
    ? path.join(__dirname, '..', 'verification-screenshots')
    : path.join(__dirname, '..', 'test-results', 'evidence');

fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
