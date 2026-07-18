import { V2_BUDGETS } from './budgets.js';

export interface BundleAsset {
  readonly name: string;
  readonly file: string;
  readonly gzipBytes: number;
}

export interface ViteManifestChunk {
  readonly file: string;
  readonly name?: string;
  readonly src?: string;
  readonly isEntry?: boolean;
  readonly isDynamicEntry?: boolean;
  readonly imports?: readonly string[];
  readonly dynamicImports?: readonly string[];
  readonly css?: readonly string[];
}

export type ViteManifest = Readonly<Record<string, ViteManifestChunk>>;

export interface BundleClassification {
  readonly initialShellJs: readonly string[];
  readonly spatialIncrementJs: readonly string[];
  readonly spatialIncrementFiles: readonly string[];
  readonly indexHtmlEagerFiles: readonly string[];
  readonly mapRouteInInitialShell: boolean;
}

interface ManifestJavaScriptAsset {
  readonly key: string;
  readonly name: string;
  readonly file: string;
}

function stableJavaScriptName(key: string, chunk: ViteManifestChunk): string {
  const sourceName = chunk.name ?? chunk.src?.split('/').at(-1)?.replace(/\.[^.]+$/, '');
  if (!sourceName) throw new Error(`Vite manifest JavaScript chunk ${key} has no stable name`);
  return sourceName.endsWith('.js') ? sourceName : `${sourceName}.js`;
}

export function manifestJavaScriptAssets(manifest: ViteManifest): readonly ManifestJavaScriptAsset[] {
  const byFile = new Map<string, ManifestJavaScriptAsset>();
  const fileByName = new Map<string, string>();

  for (const [key, chunk] of Object.entries(manifest)) {
    if (!chunk.file.endsWith('.js') || byFile.has(chunk.file)) continue;
    const name = stableJavaScriptName(key, chunk);
    const existingFile = fileByName.get(name);
    if (existingFile && existingFile !== chunk.file) {
      throw new Error(`Vite manifest stable chunk name ${name} maps to both ${existingFile} and ${chunk.file}`);
    }
    const asset = { key, name, file: chunk.file };
    byFile.set(chunk.file, asset);
    fileByName.set(name, chunk.file);
  }

  return [...byFile.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function findEntryKey(manifest: ViteManifest): string {
  if (manifest['index.html']?.isEntry) return 'index.html';
  const entries = Object.entries(manifest).filter(([, chunk]) => chunk.isEntry);
  if (entries.length !== 1) throw new Error(`Expected one Vite entry chunk, found ${entries.length}`);
  return entries[0]![0];
}

function findMapRouteKey(manifest: ViteManifest): string {
  const candidates = Object.entries(manifest).filter(([key, chunk]) => {
    const normalizedKey = key.replaceAll('\\', '/');
    const normalizedSource = chunk.src?.replaceAll('\\', '/');
    return normalizedKey.endsWith('/map.route.tsx')
      || normalizedSource?.endsWith('/map.route.tsx')
      || chunk.name === 'map.route';
  });
  if (candidates.length !== 1) throw new Error(`Expected one map route chunk, found ${candidates.length}`);
  return candidates[0]![0];
}

function importClosure(
  manifest: ViteManifest,
  rootKey: string,
  includeDynamicImports: boolean,
  dynamicBoundary: ReadonlySet<string> = new Set(),
): ReadonlySet<string> {
  const closure = new Set<string>();
  const pending = [rootKey];

  while (pending.length) {
    const key = pending.pop();
    if (!key || closure.has(key)) continue;
    const chunk = manifest[key];
    if (!chunk) throw new Error(`Vite manifest import ${key} is missing`);
    closure.add(key);
    pending.push(...(chunk.imports ?? []));
    if (includeDynamicImports && !dynamicBoundary.has(key)) {
      pending.push(...(chunk.dynamicImports ?? []));
    }
  }

  return closure;
}

function filesForClosure(manifest: ViteManifest, closure: ReadonlySet<string>): ReadonlySet<string> {
  const files = new Set<string>();
  for (const key of closure) {
    const chunk = manifest[key];
    if (!chunk) throw new Error(`Vite manifest chunk ${key} is missing`);
    files.add(chunk.file);
    for (const cssFile of chunk.css ?? []) files.add(cssFile);
  }
  return files;
}

function parseAttributes(source: string): Readonly<Record<string, string>> {
  const attributes: Record<string, string> = {};
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of source.matchAll(pattern)) {
    const name = match[1];
    if (name) attributes[name.toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return attributes;
}

function normalizeLocalAssetReference(reference: string): string | undefined {
  if (!reference || reference.startsWith('data:')) return undefined;
  const base = new URL('https://bundle.invalid/');
  const resolved = new URL(reference, base);
  if (resolved.origin !== base.origin) return undefined;
  return resolved.pathname.replace(/^\/+/, '');
}

export function indexHtmlEagerFiles(indexHtml: string): readonly string[] {
  const files = new Set<string>();
  const tagPattern = /<(script|link)\b([^>]*)>/gi;

  for (const match of indexHtml.matchAll(tagPattern)) {
    const tagName = match[1]?.toLowerCase();
    const attributeSource = match[2];
    if (!tagName || attributeSource === undefined) continue;
    const attributes = parseAttributes(attributeSource);
    const relation = attributes.rel?.toLowerCase().split(/\s+/) ?? [];
    const isEagerLink = tagName === 'link'
      && relation.some((value) => value === 'modulepreload' || value === 'preload' || value === 'stylesheet');
    const reference = tagName === 'script' ? attributes.src : isEagerLink ? attributes.href : undefined;
    const file = reference ? normalizeLocalAssetReference(reference) : undefined;
    if (file) files.add(file);
  }

  return [...files].sort();
}

export function classifyViteBundle(manifest: ViteManifest, indexHtml: string): BundleClassification {
  const entryKey = findEntryKey(manifest);
  const mapRouteKey = findMapRouteKey(manifest);
  const initialClosure = importClosure(manifest, entryKey, false);
  const spatialClosure = importClosure(manifest, mapRouteKey, true, initialClosure);
  const initialFiles = filesForClosure(manifest, initialClosure);
  const spatialFiles = filesForClosure(manifest, spatialClosure);
  const assets = manifestJavaScriptAssets(manifest);
  const nameByFile = new Map(assets.map((asset) => [asset.file, asset.name]));

  const initialShellJs = [...initialClosure]
    .map((key) => {
      const chunk = manifest[key];
      if (!chunk) throw new Error(`Vite manifest chunk ${key} is missing`);
      return nameByFile.get(chunk.file);
    })
    .filter((name): name is string => Boolean(name))
    .sort();
  const spatialIncrementFiles = [...spatialFiles]
    .filter((file) => !initialFiles.has(file))
    .sort();
  const spatialIncrementJs = spatialIncrementFiles
    .map((file) => nameByFile.get(file))
    .filter((name): name is string => Boolean(name))
    .sort();

  return {
    initialShellJs,
    spatialIncrementJs,
    spatialIncrementFiles,
    indexHtmlEagerFiles: indexHtmlEagerFiles(indexHtml),
    mapRouteInInitialShell: initialClosure.has(mapRouteKey),
  };
}

export function bundleGzipBytes(assets: readonly BundleAsset[], names: readonly string[]): number {
  const gzipByName = new Map(assets.map((asset) => [asset.name, asset.gzipBytes]));
  return names.reduce((total, name) => total + (gzipByName.get(name) ?? 0), 0);
}

export function evaluateBundle(
  assets: readonly BundleAsset[],
  baseline: Readonly<Record<string, number>>,
  classification: BundleClassification,
): readonly string[] {
  const failures: string[] = [];
  const assetNames = new Set(assets.map((asset) => asset.name));
  const classifiedNames = [...classification.initialShellJs, ...classification.spatialIncrementJs];
  for (const name of classifiedNames) {
    if (!assetNames.has(name)) failures.push(`classified JavaScript asset ${name} is missing from the build`);
  }

  const initialShellBytes = bundleGzipBytes(assets, classification.initialShellJs);
  if (initialShellBytes > V2_BUDGETS.initialShellJsGzipBytes) {
    failures.push(`initial shell JS ${initialShellBytes} bytes exceeds ${V2_BUDGETS.initialShellJsGzipBytes}`);
  }

  const spatialRuntimeBytes = bundleGzipBytes(assets, classification.spatialIncrementJs);
  if (spatialRuntimeBytes > V2_BUDGETS.spatialRuntimeJsGzipBytes) {
    failures.push(`spatial runtime JS ${spatialRuntimeBytes} bytes exceeds ${V2_BUDGETS.spatialRuntimeJsGzipBytes}`);
  }

  if (classification.mapRouteInInitialShell) failures.push('map route is part of the initial shell static dependency closure');
  const spatialFiles = new Set(classification.spatialIncrementFiles);
  for (const file of classification.indexHtmlEagerFiles) {
    if (spatialFiles.has(file)) failures.push(`index.html eagerly loads spatial asset ${file}`);
  }

  for (const asset of assets) {
    const approved = baseline[asset.name];
    if (approved === undefined) {
      failures.push(`${asset.name} is missing a baseline entry`);
      continue;
    }
    if (asset.gzipBytes > approved * (1 + V2_BUDGETS.routeChunkRegressionRatio)) {
      failures.push(`${asset.name} exceeds baseline ${approved} by more than ${V2_BUDGETS.routeChunkRegressionRatio * 100}%`);
    }
  }

  return failures;
}
