import { pathToFileURL } from 'node:url';

import { healthResponse } from '@bliver/contracts';

export interface SmokeOptions {
  readonly apiUrl: string;
  readonly expectedRelease: string;
  readonly timeoutMs: number;
}

export interface SmokeResult {
  readonly exitCode: 0 | 1;
  readonly output: string;
}

const endpointPaths = ['/healthz', '/readyz', '/versionz'] as const;

export function parseSmokeArgs(args: readonly string[]): SmokeOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (!key?.startsWith('--')) continue;
    const value = args[index + 1];
    if (!value || value.startsWith('--')) continue;
    values.set(key, value);
    index += 1;
  }

  const apiUrl = values.get('--api-url');
  if (!apiUrl) throw new Error('Missing required --api-url');
  const expectedRelease = values.get('--expected-release');
  if (!expectedRelease) throw new Error('Missing required --expected-release');
  const timeoutMs = Number(values.get('--timeout-ms') ?? 5000);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new Error('--timeout-ms must be a positive integer');
  }

  try {
    new URL(apiUrl);
  } catch {
    throw new Error('--api-url must be an absolute URL');
  }

  return { apiUrl: apiUrl.replace(/\/$/, ''), expectedRelease, timeoutMs };
}

export async function runFoundationSmoke(
  options: SmokeOptions,
  fetcher: typeof fetch = fetch,
): Promise<SmokeResult> {
  const lines: string[] = [];
  let failed = false;

  for (const path of endpointPaths) {
    const started = performance.now();
    try {
      const response = await fetcher(`${options.apiUrl}${path}`, {
        signal: AbortSignal.timeout(options.timeoutMs),
      });
      const duration = Math.max(0, Math.round(performance.now() - started));
      const requestId = response.headers.get('x-request-id');
      const contentType = response.headers.get('content-type') ?? '';
      let valid = response.status === 200 && Boolean(requestId);

      if (!contentType.includes('application/json')) {
        valid = false;
      } else {
        try {
          const body: unknown = await response.json();
          const parsed = healthResponse.parse(body);
          if (path === '/versionz' && parsed.version !== options.expectedRelease) {
            valid = false;
          }
        } catch {
          valid = false;
        }
      }

      lines.push(`GET ${path} ${response.status} ${duration}ms`);
      failed ||= !valid;
    } catch {
      lines.push(`GET ${path} ERROR`);
      failed = true;
    }
  }

  return { exitCode: failed ? 1 : 0, output: lines.join('\n') };
}

async function main(): Promise<void> {
  const options = parseSmokeArgs(process.argv.slice(2));
  const result = await runFoundationSmoke(options);
  process.stdout.write(`${result.output}\n`);
  process.exitCode = result.exitCode;
}

const entryPoint = process.argv[1];
if (entryPoint && import.meta.url === pathToFileURL(entryPoint).href) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Invalid smoke arguments';
    console.error(message);
    process.exitCode = 1;
  });
}
