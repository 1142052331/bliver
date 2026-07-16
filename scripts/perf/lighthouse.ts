import { createServer } from 'node:http';
import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
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
  const chrome = await launch({
    chromePath: chromium.executablePath(),
    chromeFlags: ['--headless', '--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
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
    await chrome.kill();
    await new Promise<void>((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
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
