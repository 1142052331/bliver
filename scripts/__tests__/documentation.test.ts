import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const canonicalDocs = ['README.md', 'AGENTS.md', 'CLAUDE.md'];

describe('V2 canonical documentation', () => {
  it.each(canonicalDocs)('%s describes the current foundation', async (file) => {
    const contents = await readFile(resolve(root, file), 'utf8');

    expect(contents).toMatch(/Node(?:\.js)?\s*24/i);
    expect(contents).toMatch(/npm workspaces/i);
    expect(contents).toContain('apps/web');
    expect(contents).toContain('apps/api');
    expect(contents).toMatch(/PostgreSQL.*PostGIS|PostGIS.*PostgreSQL/is);
    expect(contents).toContain('verify:v2-foundation');
    expect(contents).toMatch(/frozen V1|V1.*frozen/i);
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
    expect(operations).toContain('db:v2:up');
    expect(operations).toContain('V2_DATABASE_URL');
    expect(operations).toContain('smoke:v2');
  });
});
