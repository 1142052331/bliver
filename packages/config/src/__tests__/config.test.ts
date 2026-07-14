import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../../../..');

async function readJson(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(resolve(root, path), 'utf8')) as Record<
    string,
    unknown
  >;
}

describe('V2 TypeScript configuration', () => {
  it('enables the strict compiler baseline', async () => {
    const config = await readJson('tsconfig.base.json');
    const options = config.compilerOptions as Record<string, unknown>;

    expect(options).toMatchObject({
      strict: true,
      noUncheckedIndexedAccess: true,
      exactOptionalPropertyTypes: true,
      noImplicitOverride: true,
      noFallthroughCasesInSwitch: true,
      isolatedModules: true,
      noEmit: true,
    });
  });

  it.each(['apps/web/tsconfig.json', 'apps/api/tsconfig.json'])(
    '%s extends the root baseline',
    async (path) => {
      const config = await readJson(path);
      expect(config.extends).toBe('../../tsconfig.base.json');
    },
  );
});
