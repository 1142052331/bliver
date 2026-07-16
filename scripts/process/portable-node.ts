import { spawnSync } from 'node:child_process';
import { posix, win32 } from 'node:path';

export interface PortableNodeRuntime {
  readonly platform: NodeJS.Platform;
  readonly nodeExecutable: string;
  readonly root: string;
}

export interface PortableNodeCommand {
  readonly executable: string;
  readonly args: readonly string[];
}

function pathApi(platform: NodeJS.Platform): typeof posix | typeof win32 {
  return platform === 'win32' ? win32 : posix;
}

export function portablePath(runtime: PortableNodeRuntime, ...segments: readonly string[]): string {
  return pathApi(runtime.platform).resolve(runtime.root, ...segments);
}

export function portableNodeCommand(runtime: PortableNodeRuntime, entryPoint: string, args: readonly string[] = []): PortableNodeCommand {
  return { executable: runtime.nodeExecutable, args: [entryPoint, ...args] };
}

function quoteShellArgument(value: string, platform: NodeJS.Platform): string {
  if (/^[A-Za-z0-9_@%+=:,./\\-]+$/.test(value)) return value;
  return platform === 'win32'
    ? `"${value.replaceAll('"', '""')}"`
    : `'${value.replaceAll("'", "'\\''")}'`;
}

export function portableNodeCommandString(command: PortableNodeCommand, platform: NodeJS.Platform): string {
  return [command.executable, ...command.args].map((value) => quoteShellArgument(value, platform)).join(' ');
}

export function spawnPortableNodeCommand(command: PortableNodeCommand, options: { readonly cwd: string; readonly env?: NodeJS.ProcessEnv; readonly stdio?: 'inherit' | 'pipe'; readonly timeout?: number }) {
  return spawnSync(command.executable, [...command.args], {
    cwd: options.cwd,
    ...(options.env ? { env: options.env } : {}),
    ...(options.stdio ? { stdio: options.stdio } : {}),
    ...(options.timeout ? { timeout: options.timeout } : {}),
  });
}
