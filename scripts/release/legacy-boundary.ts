import { access, readFile, readdir } from 'node:fs/promises';
import { extname, relative, resolve, sep } from 'node:path';

export interface LegacyInventory {
  readonly runtimeRoots: readonly string[];
  readonly sourceFileCounts: Readonly<Record<string, number>>;
  readonly packages: readonly string[];
  readonly environmentNames: readonly string[];
  readonly routes: readonly string[];
  readonly socketEvents: readonly string[];
  readonly assets: readonly string[];
}

const excludedDirectories = new Set(['node_modules', 'dist', 'coverage', '.git']);
const textExtensions = new Set(['.cjs', '.css', '.html', '.js', '.jsx', '.json', '.mjs', '.ts', '.tsx', '.yaml', '.yml']);
const assetExtensions = new Set(['.gif', '.ico', '.jpeg', '.jpg', '.mp3', '.mp4', '.png', '.svg', '.ttf', '.webp', '.woff', '.woff2']);
const v2Roots = ['apps', 'packages'] as const;
const forbiddenDependencies = new Set(['jsonwebtoken', 'mongodb', 'mongodb-memory-server', 'mongoose']);
const legacySymbols = ['ClusterDetailPanel', 'LegacyDestinationBridge', 'ProfileDrawer', 'TimelineDrawer'] as const;

function normalizedRelative(root: string, path: string): string {
  return relative(root, path).split(sep).join('/');
}

async function listFiles(directory: string): Promise<string[]> {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch { return []; }
  const nested = await Promise.all(entries
    .filter((entry) => !entry.isDirectory() || !excludedDirectories.has(entry.name))
    .map(async (entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return listFiles(path);
      return entry.isFile() ? [path] : [];
    }));
  return nested.flat().sort((left, right) => left.localeCompare(right));
}

async function readText(path: string): Promise<string> {
  return readFile(path, 'utf8');
}

function dependencies(document: unknown): string[] {
  if (!document || typeof document !== 'object') return [];
  const pkg = document as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  return [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})];
}

export async function collectLegacyInventory(rootInput: string): Promise<LegacyInventory> {
  const root = resolve(rootInput);
  const runtimeRoots = (await Promise.all(['frontend', 'backend'].map(async (name) => {
    try { await access(resolve(root, name)); return name; }
    catch { return null; }
  }))).filter((name): name is string => name !== null);
  const filesByRoot = new Map(await Promise.all(runtimeRoots.map(async (name) => [name, await listFiles(resolve(root, name))] as const)));
  const allFiles = [...filesByRoot.values()].flat();
  const textFiles = allFiles.filter((path) => textExtensions.has(extname(path).toLowerCase()));
  const texts = await Promise.all(textFiles.map(async (path) => [path, await readText(path)] as const));

  const packageNames = new Set<string>();
  for (const name of runtimeRoots) {
    try {
      const document = JSON.parse(await readText(resolve(root, name, 'package.json'))) as unknown;
      for (const dependency of dependencies(document)) packageNames.add(dependency);
    } catch { /* An absent package manifest is represented by an empty package list. */ }
  }

  const environmentNames = new Set<string>();
  const routes = new Set<string>();
  const socketEvents = new Set<string>();
  for (const [path, content] of texts) {
    for (const match of content.matchAll(/(?:process\.env|import\.meta\.env)\.([A-Z][A-Z0-9_]*)/g)) {
      if (match[1]) environmentNames.add(match[1]);
    }
    if (normalizedRelative(root, path).startsWith('backend/') && !normalizedRelative(root, path).includes('/__tests__/')) {
      for (const match of content.matchAll(/\b(router|app)\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g)) {
        const owner = match[1];
        const method = match[2]?.toUpperCase();
        const declaredPath = match[3];
        if (method && declaredPath) routes.add(`${method} ${owner === 'router' ? '/api' : ''}${declaredPath}`);
      }
      const relativePath = normalizedRelative(root, path);
      const eventPattern = relativePath.startsWith('backend/socket/')
        ? /\.(?:on|emit)\(\s*['"]([^'"]+)['"]/g
        : relativePath.startsWith('backend/services/')
          ? /\.emit\(\s*['"]([^'"]+)['"]/g
          : null;
      if (eventPattern) for (const match of content.matchAll(eventPattern)) {
        if (match[1]) socketEvents.add(match[1]);
      }
    }
  }

  return {
    runtimeRoots,
    sourceFileCounts: Object.fromEntries([...filesByRoot].map(([name, files]) => [name, files.length])),
    packages: [...packageNames].sort(),
    environmentNames: [...environmentNames].sort(),
    routes: [...routes].sort(),
    socketEvents: [...socketEvents].sort(),
    assets: allFiles.filter((path) => assetExtensions.has(extname(path).toLowerCase())).map((path) => normalizedRelative(root, path)).sort(),
  };
}

export async function findV2LegacyViolations(rootInput: string): Promise<readonly string[]> {
  const root = resolve(rootInput);
  const violations: string[] = [];
  for (const directory of v2Roots) {
    for (const path of await listFiles(resolve(root, directory))) {
      const relativePath = normalizedRelative(root, path);
      if (path.endsWith('package.json')) {
        const document = JSON.parse(await readText(path)) as unknown;
        for (const dependency of dependencies(document)) {
          if (forbiddenDependencies.has(dependency)) violations.push(`${relativePath}: forbidden V1 dependency ${dependency}`);
        }
        continue;
      }
      if (!textExtensions.has(extname(path).toLowerCase())) continue;
      const content = await readText(path);
      if (/(?:from\s+|import\s*\(|require\s*\()\s*['"][^'"]*(?:frontend|backend)[/\\]/.test(content)) {
        violations.push(`${relativePath}: V1 path import`);
      }
      for (const symbol of legacySymbols) {
        if (content.includes(symbol)) violations.push(`${relativePath}: forbidden legacy symbol ${symbol}`);
      }
      if (/new\s+CustomEvent\(\s*['"]ws:/.test(content)) {
        violations.push(`${relativePath}: forbidden ws: CustomEvent bridge`);
      }
    }
  }
  return violations.sort();
}
