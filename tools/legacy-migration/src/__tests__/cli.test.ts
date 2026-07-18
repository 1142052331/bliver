import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { runCli } from '../cli.js';

describe('migration CLI', () => {
  it('runs fixture preflight without any Mongo connection', async () => {
    const output: string[] = [];
    const code = await runCli(['preflight', '--fixture', resolve('fixtures/v1-complete.json')], {}, (line) => output.push(line));
    expect(code).toBe(0);
    expect(output.join('\n')).toContain('"blocked":0');
  });

  it('requires an explicit source database and does not print secrets', async () => {
    const output: string[] = [];
    const code = await runCli(['preflight', '--source', 'mongo'], { LEGACY_MONGO_URL: 'mongodb://user:secret@source.invalid/default' }, (line) => output.push(line));
    expect(code).toBe(1);
    expect(output.join('\n')).toContain('MONGO_DATABASE_REQUIRED');
    expect(output.join('\n')).not.toContain('secret');
  });

  it('runs source preflight against an injected read-only collection source', async () => {
    const output: string[] = [];
    const code = await runCli(['preflight', '--source', 'mongo'], {
      LEGACY_MONGO_URL: 'mongodb://source.invalid/test',
      LEGACY_MONGO_DATABASE: 'test',
    }, (line) => output.push(line), async () => ({
      collections: async () => ({
        AdminBootstrap: [], Announcement: [], AuditLog: [], BackfillDiscoveryWindow: [], Block: [],
        Conversation: [], Feedback: [], Footprint: [], FootprintRead: [], Friendship: [], Message: [],
        Notification: [], PushSubscription: [], Report: [], User: [],
      }),
      close: async () => undefined,
    }));
    expect(code).toBe(0);
    expect(output.join('\n')).toContain('"blocked":0');
  });
});
