import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

import { verifyCandidate, verifyReleaseIdentity } from './candidate.js';

const root = resolve(import.meta.dirname, '../..');
const releaseSha = process.env.RELEASE_SHA?.trim() ?? '';
const gitHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const renderGitCommit = process.env.RENDER_GIT_COMMIT?.trim();
const identity = { releaseSha, gitHead, ...(renderGitCommit ? { renderGitCommit } : {}) };

if (process.argv.includes('--sha-only')) verifyReleaseIdentity(identity);
else await verifyCandidate({ root, ...identity });
console.log(`V2 candidate verified release=${releaseSha}`);
