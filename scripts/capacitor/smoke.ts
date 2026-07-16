import { spawnSync } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { deepLinkDestination, loginReturnDestination } from '../../apps/web/src/platform/deep-link.js';

interface CapacitorConfigInput {
  readonly appId?: string;
  readonly webDir?: string;
  readonly server?: { readonly url?: string; readonly cleartext?: boolean };
}

export interface CapacitorCommandGate {
  readonly label: string;
  readonly entryPoint: string;
  readonly args: readonly string[];
  readonly timeoutMs: number;
}

export type CapacitorCommandRunner = (command: CapacitorCommandGate) => number;

export const CAPACITOR_COMMAND_GATES: readonly CapacitorCommandGate[] = [
  {
    label: 'platform behavior',
    entryPoint: 'node_modules/vitest/vitest.mjs',
    args: ['run', 'apps/web/src/platform/__tests__/pwa-capacitor.test.ts', '--reporter=dot'],
    timeoutMs: 120_000,
  },
  {
    label: 'browser deep-link auth return',
    entryPoint: 'node_modules/@playwright/test/cli.js',
    args: [
      'test',
      'apps/web/e2e/auth.spec.ts',
      '--project=mobile-390x844',
      '--grep=Capacitor footprint deep link returns to the footprint after login',
      '--output=test-results/capacitor-smoke',
    ],
    timeoutMs: 180_000,
  },
  {
    label: 'Android sync',
    entryPoint: 'node_modules/@capacitor/cli/bin/capacitor',
    args: ['sync', 'android'],
    timeoutMs: 120_000,
  },
] as const;

function executeCommandGate(command: CapacitorCommandGate): number {
  console.log(`[capacitor] running ${command.label}`);
  const result = spawnSync(process.execPath, [resolve(command.entryPoint), ...command.args], {
    cwd: resolve('.'),
    env: { ...process.env, FORCE_COLOR: '0' },
    stdio: 'inherit',
    timeout: command.timeoutMs,
  });
  if (result.error) console.error(`[capacitor] ${command.label}: ${result.error.message}`);
  return result.status ?? 1;
}

export function runCapacitorCommandGates(runner: CapacitorCommandRunner = executeCommandGate): readonly string[] {
  const failures: string[] = [];
  for (const command of CAPACITOR_COMMAND_GATES) {
    if (runner(command) !== 0) failures.push(`${command.label} failed`);
  }
  return failures;
}

export function validateCapacitorConfig(config: CapacitorConfigInput): readonly string[] {
  const failures: string[] = [];
  if (config.appId !== 'com.bliver.app') failures.push('Capacitor appId must remain com.bliver.app');
  if (config.webDir !== 'apps/web/dist') failures.push('Capacitor webDir must resolve to apps/web/dist');
  if (!config.server?.url?.startsWith('https://')) failures.push('Capacitor production server must use HTTPS');
  if (config.server?.cleartext !== false) failures.push('Capacitor cleartext traffic must be disabled');
  return failures;
}

export function validateDeepLinkAuthReturn(value: string): boolean {
  const loginPath = deepLinkDestination(value, false);
  const authenticatedPath = deepLinkDestination(value, true);
  if (!loginPath || !authenticatedPath) return false;
  const search = new URL(loginPath, 'https://bliver.local').search;
  return loginReturnDestination(search) === authenticatedPath;
}

export function validateAndroidDeepLinks(manifest: string, serverUrl: string | undefined): readonly string[] {
  const failures: string[] = [];
  if (!manifest.includes('android:scheme="bliver"')) failures.push('Android custom-scheme deep link is missing');
  if (!manifest.includes('android:autoVerify="true"')) failures.push('Android verified App Link is missing');
  try {
    const host = new URL(serverUrl ?? '').host;
    if (!manifest.includes(`android:host="${host}"`)) failures.push('Android verified App Link host must match the Capacitor production server');
  } catch {
    failures.push('Android verified App Link host must match the Capacitor production server');
  }
  return failures;
}

export function validateOfflineWorkerPolicy(worker: string): boolean {
  const navigation = worker.indexOf("request.mode === 'navigate'");
  const credentials = worker.indexOf("request.credentials === 'include'");
  return worker.includes("pathname.startsWith('/api/')")
    && worker.includes("caches.match('/index.html')")
    && navigation >= 0
    && credentials >= 0
    && navigation < credentials;
}

export async function runCapacitorSmoke(): Promise<void> {
  const config = JSON.parse(await readFile(resolve('capacitor.config.json'), 'utf8')) as CapacitorConfigInput;
  const failures = [...validateCapacitorConfig(config)];
  const webDir = resolve(config.webDir ?? '');
  await access(resolve(webDir, 'index.html')).catch(() => failures.push('apps/web/dist/index.html is missing; run the V2 web build'));
  const webManifest = await readFile(resolve(webDir, 'manifest.webmanifest'), 'utf8').catch(() => {
    failures.push('PWA manifest is missing from apps/web/dist');
    return '';
  });
  if (webManifest) {
    const icons = (JSON.parse(webManifest) as { icons?: Array<{ src?: string }> }).icons ?? [];
    await Promise.all(icons.map(async ({ src }) => {
      if (!src) return;
      await access(resolve(webDir, src.replace(/^\/+/, ''))).catch(() => failures.push(`PWA icon is missing from apps/web/dist: ${src}`));
    }));
  }
  const worker = await readFile(resolve(webDir, 'sw.js'), 'utf8').catch(() => '');
  if (!validateOfflineWorkerPolicy(worker)) failures.push('PWA cache policy is incomplete in apps/web/dist');
  const credentials = await readFile(resolve('apps/web/src/platform/credentials.ts'), 'utf8');
  if (!credentials.includes("'hardware-backed' | 'encrypted'")) failures.push('Capacitor credential adapter is not constrained to secure storage');
  failures.push(...runCapacitorCommandGates());
  const manifest = await readFile(resolve('android/app/src/main/AndroidManifest.xml'), 'utf8');
  failures.push(...validateAndroidDeepLinks(manifest, config.server?.url));
  if (!validateDeepLinkAuthReturn('bliver://app/footprints/footprint-1')) failures.push('Footprint deep link does not survive authentication');
  if (failures.length) throw new Error(`Capacitor smoke failed:\n- ${failures.join('\n- ')}`);
  console.log('[capacitor] PASS V2 PWA and Capacitor smoke');
}

const entryPoint = process.argv[1];
if (entryPoint && import.meta.url === pathToFileURL(entryPoint).href) {
  runCapacitorSmoke().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Capacitor smoke failed');
    process.exitCode = 1;
  });
}
