import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const canonicalDocs = ['README.md', 'AGENTS.md', 'CLAUDE.md'];
const staleDocTokens = [
  ['front', 'end/'].join(''),
  ['back', 'end/'].join(''),
  ['MONGO', 'DB_URI'].join(''),
  ['JWT', '_SECRET'].join(''),
];

describe('V2 canonical documentation', () => {
  it.each(canonicalDocs)('%s describes the current foundation', async (file) => {
    const contents = await readFile(resolve(root, file), 'utf8');

    expect(contents).toMatch(/Node(?:\.js)?\s*24/i);
    expect(contents).toMatch(/npm workspaces/i);
    expect(contents).toContain('apps/web');
    expect(contents).toContain('apps/api');
    expect(contents).toMatch(/PostgreSQL.*PostGIS|PostGIS.*PostgreSQL/is);
    expect(contents).toContain('verify:v2-foundation');
    expect(contents).toContain('/api/v1');
    expect(contents).toContain('cutover:v2:check');
    for (const token of staleDocTokens) expect(contents).not.toContain(token);
  });

  it('keeps the local V2 runbook and architecture entrypoints', async () => {
    const architecture = await readFile(
      resolve(root, 'docs/architecture/v2-foundation.md'),
      'utf8',
    );
    const operations = await readFile(
      resolve(root, 'docs/operations/v2-local-development.md'),
      'utf8',
    );

    expect(architecture).toContain('PostgreSQL');
    expect(architecture).toContain('apps/web');
    expect(architecture).toContain('apps/api');
    expect(architecture).toContain('/api/v1');
    expect(operations).toContain('db:v2:up');
    expect(operations).toContain('V2_DATABASE_URL');
    expect(operations).toContain('smoke:v2');
    for (const token of staleDocTokens) expect(operations).not.toContain(token);
  });

  it('documents the production release, rollback, and restored-backup gates', async () => {
    const deploy = await readFile(resolve(root, 'docs/operations/deploy.md'), 'utf8');
    const rollback = await readFile(resolve(root, 'docs/operations/rollback.md'), 'utf8');
    const backup = await readFile(resolve(root, 'docs/operations/backup-restore.md'), 'utf8');
    const release = await readFile(resolve(root, 'docs/release/eight-phase-release-runbook.md'), 'utf8');
    expect(deploy).toContain('npm run render-build');
    expect(deploy).toContain('release:v2:predeploy');
    expect(deploy).toContain('npm start');
    expect(rollback).toContain('/versionz');
    expect(backup).toContain('pg_restore');
    expect(release).toContain('BLOCKED');
  });

  it('preserves the Phase 7 facts under an explicit archive boundary', async () => {
    const phase7 = await readFile(resolve(root, 'docs/archive/qa/v2-phase-7-hardening.md'), 'utf8');
    expect(phase7).toContain('DONE_WITH_CONCERNS');
    expect(phase7).toContain('Do not create `v2-phase-7-hardening`');
  });
});
