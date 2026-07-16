import { describe, expect, it } from 'vitest';

import * as playwrightServers from '../process/playwright-servers.js';

describe('Playwright server commands', () => {
  it('builds portable Node CLI commands for Windows and Linux', () => {
    const createServers = (playwrightServers as typeof playwrightServers & {
      createPlaywrightWebServers?: (runtime: { readonly platform: NodeJS.Platform; readonly nodeExecutable: string; readonly root: string }) => readonly { readonly command: string }[];
    }).createPlaywrightWebServers;
    expect(createServers).toBeTypeOf('function');
    if (!createServers) return;

    const linux = createServers({ platform: 'linux', nodeExecutable: '/usr/bin/node', root: '/workspace' });
    expect(linux.map(({ command }) => command)).toEqual([
      '/usr/bin/node /workspace/node_modules/tsx/dist/cli.mjs apps/api/src/bootstrap/e2e-server.ts',
      '/usr/bin/node /workspace/node_modules/vite/bin/vite.js --host 127.0.0.1',
    ]);
    const windows = createServers({ platform: 'win32', nodeExecutable: 'C:\\Program Files\\nodejs\\node.exe', root: 'C:\\workspace' });
    expect(windows.every(({ command }) => !command.includes('npm.cmd') && !command.includes('npx.cmd'))).toBe(true);
    expect(windows[0]?.command).toContain('"C:\\Program Files\\nodejs\\node.exe"');
    expect(windows[0]?.command).toContain('C:\\workspace\\node_modules\\tsx\\dist\\cli.mjs');
  });
});
