import { access, readFile, readdir } from 'node:fs/promises';
import { extname, relative, resolve, sep } from 'node:path';

const legacyRoots = [['front', 'end'].join(''), ['back', 'end'].join('')] as const;
const forbiddenDependencies = [
  ['mongo', 'ose'].join(''),
  ['mongo', 'db-memory-server'].join(''),
  ['json', 'webtoken'].join(''),
] as const;
const forbiddenRuntimeTokens = [
  ['MONGO', 'DB_URI'].join(''),
  ['JWT', '_SECRET'].join(''),
  ['Profile', 'Drawer'].join(''),
  ['ClusterDetail', 'Panel'].join(''),
  ['LegacyDestination', 'Bridge'].join(''),
  ['Timeline', 'Drawer'].join(''),
  ['force', '_logout'].join(''),
  ['receive', '_message'].join(''),
  ['send', '_message'].join(''),
  ['profile', ':updated'].join(''),
  ['footprint', ':new'].join(''),
] as const;
const textExtensions = new Set(['.cjs', '.js', '.jsx', '.json', '.mjs', '.ts', '.tsx']);

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; }
  catch { return false; }
}

async function listFiles(directory: string): Promise<string[]> {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch { return []; }
  const nested = await Promise.all(entries
    .filter((entry) => !entry.isDirectory() || !['node_modules', 'dist', 'generated'].includes(entry.name))
    .map(async (entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return listFiles(path);
      return entry.isFile() ? [path] : [];
    }));
  return nested.flat();
}

function normalized(root: string, path: string): string {
  return relative(root, path).split(sep).join('/');
}

function dependencyNames(document: unknown): readonly string[] {
  const pkg = document as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  return [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})];
}

export async function findCutoverViolations(rootInput: string): Promise<readonly string[]> {
  const root = resolve(rootInput);
  const violations: string[] = [];
  for (const legacyRoot of legacyRoots) {
    if (await exists(resolve(root, legacyRoot))) violations.push(`${legacyRoot}/ still exists`);
  }

  const oldVerifier = resolve(root, 'scripts', ['verify', 'release.mjs'].join('-'));
  if (await exists(oldVerifier)) violations.push(`${normalized(root, oldVerifier)} is a V1 release verifier`);

  const packagePaths = [resolve(root, 'package.json'), ...(await Promise.all(['apps', 'packages'].map((directory) => listFiles(resolve(root, directory))))).flat().filter((path) => path.endsWith('package.json'))];
  for (const path of packagePaths) {
    const document = JSON.parse(await readFile(path, 'utf8')) as { scripts?: Record<string, string> };
    for (const dependency of dependencyNames(document)) {
      if (forbiddenDependencies.includes(dependency as (typeof forbiddenDependencies)[number])) {
        violations.push(`${normalized(root, path)} directly depends on ${dependency}`);
      }
    }
    for (const [name, command] of Object.entries(document.scripts ?? {})) {
      if (legacyRoots.some((legacyRoot) => command.includes(legacyRoot))) violations.push(`${normalized(root, path)} script ${name} invokes a V1 root`);
      if (name === ['verify', 'release'].join(':')) violations.push(`${normalized(root, path)} retains the V1 release command`);
    }
  }

  const runtimeFiles = (await Promise.all(['apps', 'packages'].map((directory) => listFiles(resolve(root, directory))))).flat()
    .filter((path) => textExtensions.has(extname(path).toLowerCase()));
  for (const path of runtimeFiles) {
    const content = await readFile(path, 'utf8');
    for (const token of forbiddenRuntimeTokens) {
      if (content.includes(token)) violations.push(`${normalized(root, path)} contains legacy runtime token ${token}`);
    }
    if (/['"]\/api\/(?!v1(?:\/|['"])|['"])/g.test(content)) violations.push(`${normalized(root, path)} contains an unversioned V1 API path`);
  }
  return violations.sort();
}
