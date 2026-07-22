import { V2_BUDGETS } from './budgets.js';

export interface BundleAsset {
  readonly logicalName: string;
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
  readonly initialShellJsFiles: readonly string[];
  readonly spatialIncrementJsFiles: readonly string[];
  readonly spatialIncrementFiles: readonly string[];
  readonly indexHtmlEagerFiles: readonly string[];
  readonly mapRouteInInitialShell: boolean;
}

export interface ManifestJavaScriptAsset {
  readonly key: string;
  readonly logicalName: string;
  readonly file: string;
}

function stableJavaScriptName(key: string, chunk: ViteManifestChunk): string {
  const sourceName = chunk.name ?? chunk.src?.split('/').at(-1)?.replace(/\.[^.]+$/, '');
  if (!sourceName) throw new Error(`Vite manifest JavaScript chunk ${key} has no stable name`);
  return sourceName.endsWith('.js') ? sourceName : `${sourceName}.js`;
}

export function manifestJavaScriptAssets(manifest: ViteManifest): readonly ManifestJavaScriptAsset[] {
  const byFile = new Map<string, ManifestJavaScriptAsset>();

  for (const [key, chunk] of Object.entries(manifest)) {
    if (!chunk.file.endsWith('.js')) continue;
    const logicalName = stableJavaScriptName(key, chunk);
    const existing = byFile.get(chunk.file);
    if (existing) {
      if (existing.logicalName !== logicalName) {
        throw new Error(`Vite manifest JavaScript file ${chunk.file} maps to both ${existing.logicalName} and ${logicalName}`);
      }
      continue;
    }
    const asset = {
      key,
      logicalName,
      file: chunk.file,
    };
    byFile.set(chunk.file, asset);
  }

  return [...byFile.values()].sort((left, right) =>
    left.logicalName.localeCompare(right.logicalName) || left.file.localeCompare(right.file));
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
  const initialShellJsFiles = [...initialFiles]
    .filter((file) => file.endsWith('.js'))
    .sort();
  const spatialIncrementFiles = [...spatialFiles]
    .filter((file) => !initialFiles.has(file))
    .sort();
  const spatialIncrementJsFiles = spatialIncrementFiles
    .filter((file) => file.endsWith('.js'))
    .sort();

  return {
    initialShellJsFiles,
    spatialIncrementJsFiles,
    spatialIncrementFiles,
    indexHtmlEagerFiles: indexHtmlEagerFiles(indexHtml),
    mapRouteInInitialShell: initialClosure.has(mapRouteKey),
  };
}

function assetsByPhysicalFile(assets: readonly BundleAsset[]): ReadonlyMap<string, BundleAsset> {
  const byFile = new Map<string, BundleAsset>();
  for (const asset of assets) {
    const existing = byFile.get(asset.file);
    if (existing) {
      if (existing.logicalName !== asset.logicalName || existing.gzipBytes !== asset.gzipBytes) {
        throw new Error(`Bundle asset file ${asset.file} has conflicting descriptors`);
      }
      continue;
    }
    byFile.set(asset.file, asset);
  }
  return byFile;
}

export function bundleGzipBytes(assets: readonly BundleAsset[], files: readonly string[]): number {
  const byFile = assetsByPhysicalFile(assets);
  return [...new Set(files)].reduce((total, file) => total + (byFile.get(file)?.gzipBytes ?? 0), 0);
}

export function evaluateBundle(
  assets: readonly BundleAsset[],
  baseline: Readonly<Record<string, number>>,
  classification: BundleClassification,
): readonly string[] {
  const failures: string[] = [];
  const physicalAssets = [...assetsByPhysicalFile(assets).values()];
  const assetFiles = new Set(physicalAssets.map((asset) => asset.file));
  const classifiedFiles = new Set([
    ...classification.initialShellJsFiles,
    ...classification.spatialIncrementJsFiles,
  ]);
  for (const file of classifiedFiles) {
    if (!assetFiles.has(file)) failures.push(`classified JavaScript asset ${file} is missing from the build`);
  }

  const initialShellBytes = bundleGzipBytes(assets, classification.initialShellJsFiles);
  if (initialShellBytes > V2_BUDGETS.initialShellJsGzipBytes) {
    failures.push(`initial shell JS ${initialShellBytes} bytes exceeds ${V2_BUDGETS.initialShellJsGzipBytes}`);
  }

  const spatialRuntimeBytes = bundleGzipBytes(assets, classification.spatialIncrementJsFiles);
  if (spatialRuntimeBytes > V2_BUDGETS.spatialRuntimeJsGzipBytes) {
    failures.push(`spatial runtime JS ${spatialRuntimeBytes} bytes exceeds ${V2_BUDGETS.spatialRuntimeJsGzipBytes}`);
  }

  if (classification.mapRouteInInitialShell) failures.push('map route is part of the initial shell static dependency closure');
  const spatialFiles = new Set(classification.spatialIncrementFiles);
  for (const file of classification.indexHtmlEagerFiles) {
    if (spatialFiles.has(file)) failures.push(`index.html eagerly loads spatial asset ${file}`);
  }

  const gzipByLogicalName = new Map<string, number>();
  for (const asset of physicalAssets) {
    gzipByLogicalName.set(
      asset.logicalName,
      (gzipByLogicalName.get(asset.logicalName) ?? 0) + asset.gzipBytes,
    );
  }

  for (const [logicalName, gzipBytes] of [...gzipByLogicalName.entries()]
    .sort(([left], [right]) => left.localeCompare(right))) {
    const approved = baseline[logicalName];
    if (approved === undefined) {
      failures.push(`${logicalName} is missing a baseline entry`);
      continue;
    }
    if (gzipBytes > approved * (1 + V2_BUDGETS.routeChunkRegressionRatio)) {
      failures.push(`${logicalName} exceeds baseline ${approved} by more than ${V2_BUDGETS.routeChunkRegressionRatio * 100}%`);
    }
  }

  return failures;
}
