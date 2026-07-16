import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const freezeSource = '8aa34867ceefbb296721392cd5dda4b7a8dcd00b';

function documentedV1Assets(document: string): readonly string[] {
  const section = document.match(/### V1 assets\s+```text\s+([\s\S]*?)```/);
  if (!section?.[1]) throw new Error('V1 asset inventory section is missing');
  return section[1].split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

describe('frozen V1 deletion inventory', () => {
  it('matches every tracked public asset at the Phase 8 freeze source', async () => {
    const document = await readFile(resolve(root, 'docs/archive/qa/v2-phase-8-deletion-inventory.md'), 'utf8');
    expect(document).toContain(`Freeze source: \`${freezeSource}\``);
    const trackedAssets = execFileSync(
      'git',
      ['ls-tree', '-r', '--name-only', freezeSource, '--', 'frontend/public'],
      { cwd: root, encoding: 'utf8' },
    ).split(/\r?\n/).filter(Boolean);

    expect(documentedV1Assets(document)).toEqual(trackedAssets);
  });
});
