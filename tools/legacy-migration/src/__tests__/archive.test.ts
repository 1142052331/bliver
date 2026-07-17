import { describe, expect, it } from 'vitest';

import { createArchive } from '../adapters/archive.js';

describe('encrypted Mongo archive boundary', () => {
  it('uses protected config arguments and age recipients without shell interpolation', async () => {
    const calls: Array<{ command: string; args: readonly string[] }> = [];
    const archive = createArchive(async (command, args) => { calls.push({ command, args }); return { code: 0 }; });
    await archive.dump({ protectedMongoConfig: '.migration/mongo.conf', database: 'bliver_v1', recipientFile: '.migration/recipients', output: '.migration/v1.archive.gz.age' });
    expect(calls).toEqual([
      { command: 'mongodump', args: ['--config', '.migration/mongo.conf', '--db', 'bliver_v1', '--archive', '--gzip'] },
      { command: 'age', args: ['--recipient-file', '.migration/recipients', '--output', '.migration/v1.archive.gz.age'] },
    ]);
    expect(calls.flatMap((call) => call.args).join(' ')).not.toContain('mongodb://');
  });
});
