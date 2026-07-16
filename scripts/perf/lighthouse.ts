import { createServer, type Server } from 'node:http';
import { access, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';

const DIST_ROOT = resolve('apps/web/dist');
const REPORT_PATH = resolve('.artifacts/lighthouse-v2.json');

const contentTypes: Readonly<Record<string, string>> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

async function existingFile(pathname: string): Promise<string | null> {
  const candidate = resolve(DIST_ROOT, `.${pathname}`);
  if (candidate !== DIST_ROOT && !candidate.startsWith(`${DIST_ROOT}${sep}`)) return null;
  try { return (await stat(candidate)).isFile() ? candidate : null; }
  catch { return null; }
}

export async function shutdownHttpServer(server: Server, timeoutMs = 1_000): Promise<void> {
  if (!server.listening) {
    server.closeAllConnections();
    return;
  }

  await new Promise<void>((resolveShutdown) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolveShutdown();
    };
    const timeout = setTimeout(() => {
      server.closeAllConnections();
      finish();
    }, Math.max(1, timeoutMs));
    timeout.unref();

    try {
      server.close(() => finish());
      server.closeIdleConnections();
      server.closeAllConnections();
    } catch {
      server.closeAllConnections();
      finish();
    }
  });
}

interface TemporaryDirectoryOptions {
  readonly attempts?: number;
  readonly retryDelayMs?: number;
  readonly remove?: (path: string) => Promise<void>;
}

interface ChromeHandle {
  readonly kill: () => void;
  readonly process?: Readonly<{ readonly spawnargs?: readonly string[] }>;
}

const transientCleanupCodes = new Set(['EBUSY', 'ENOTEMPTY', 'EPERM']);

function isTransientCleanupError(error: unknown): boolean {
  return transientCleanupCodes.has((error as NodeJS.ErrnoException | undefined)?.code ?? '');
}

export async function removeTemporaryDirectory(
  path: string,
  options: TemporaryDirectoryOptions = {},
): Promise<void> {
  const attempts = Math.max(1, options.attempts ?? 20);
  const retryDelayMs = Math.max(0, options.retryDelayMs ?? 100);
  const remove = options.remove ?? ((candidate: string) => rm(candidate, { force: true, recursive: true }));
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await remove(path);
      return;
    } catch (error: unknown) {
      if (!isTransientCleanupError(error) || attempt === attempts) throw error;
      if (retryDelayMs > 0) await new Promise((resolveDelay) => setTimeout(resolveDelay, retryDelayMs));
    }
  }
}

export async function shutdownChrome(
  chrome: ChromeHandle,
  options: TemporaryDirectoryOptions = {},
): Promise<void> {
  const profilePrefix = '--user-data-dir=';
  const profileArgument = chrome.process?.spawnargs?.find((argument) => argument.startsWith(profilePrefix));
  const profileDirectory = profileArgument?.slice(profilePrefix.length);
  let killError: unknown;
  try {
    chrome.kill();
  } catch (error: unknown) {
    killError = error;
  }
  if (profileDirectory) await removeTemporaryDirectory(profileDirectory, options);
  if (killError && (!profileDirectory || !isTransientCleanupError(killError))) throw killError;
}

export async function generateLighthouseReport(): Promise<string> {
  await access(resolve(DIST_ROOT, 'index.html'));
  const server = createServer((request, response) => {
    void (async () => {
      const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
      if (pathname === '/api/v1/session') {
        response.writeHead(401, { 'content-type': 'application/problem+json', 'cache-control': 'no-store' });
        response.end(JSON.stringify({ code: 'AUTH_REQUIRED' }));
        return;
      }
      const file = await existingFile(pathname) ?? resolve(DIST_ROOT, 'index.html');
      response.writeHead(200, { 'content-type': contentTypes[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      response.end(await readFile(file));
    })().catch((error: unknown) => {
      response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      response.end(error instanceof Error ? error.message : 'Lighthouse fixture server failed');
    });
  });
  await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Lighthouse fixture server address is unavailable');
  let chrome: Awaited<ReturnType<typeof launch>> | undefined;
  try {
    chrome = await launch({
      chromePath: chromium.executablePath(),
      chromeFlags: ['--headless', '--no-sandbox', '--disable-dev-shm-usage'],
    });
    const result = await lighthouse(`http://127.0.0.1:${address.port}/login`, {
      port: chrome.port,
      output: 'json',
      logLevel: 'error',
      onlyCategories: ['performance'],
      formFactor: 'mobile',
      screenEmulation: { mobile: true, width: 390, height: 844, deviceScaleFactor: 2, disabled: false },
      throttlingMethod: 'provided',
    });
    if (!result) throw new Error('Lighthouse returned no result');
    const report = Array.isArray(result.report) ? result.report[0] : result.report;
    if (typeof report !== 'string') throw new Error('Lighthouse JSON report is unavailable');
    await mkdir(resolve('.artifacts'), { recursive: true });
    await writeFile(REPORT_PATH, report, 'utf8');
    return REPORT_PATH;
  } finally {
    try {
      if (chrome) await shutdownChrome(chrome);
    } finally {
      await shutdownHttpServer(server);
    }
  }
}

const entryPoint = process.argv[1];
if (entryPoint && import.meta.url === pathToFileURL(entryPoint).href) {
  generateLighthouseReport()
    .then((path) => console.log(`[lighthouse] report=${path}`))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
