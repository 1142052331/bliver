import { resolve } from 'node:path';

import { portableNodeCommand, portableNodeCommandString, portablePath, type PortableNodeRuntime } from './portable-node.js';

export function createPlaywrightWebServers(runtime: PortableNodeRuntime = { platform: process.platform, nodeExecutable: process.execPath, root: resolve('.') }) {
  const apiCommand = portableNodeCommand(runtime, portablePath(runtime, 'node_modules', 'tsx', 'dist', 'cli.mjs'), ['apps/api/src/bootstrap/e2e-server.ts']);
  const webCommand = portableNodeCommand(runtime, portablePath(runtime, 'node_modules', 'vite', 'bin', 'vite.js'), ['--mode', 'v2', '--host', '127.0.0.1']);
  return [
    { command: portableNodeCommandString(apiCommand, runtime.platform), url: 'http://127.0.0.1:5100/healthz', reuseExistingServer: !process.env.CI, timeout: 120_000, cwd: runtime.root },
    { command: portableNodeCommandString(webCommand, runtime.platform), url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI, timeout: 120_000, cwd: portablePath(runtime, 'apps', 'web') },
  ];
}
