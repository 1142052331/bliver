import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, normalize, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const repositoryRoot = resolve(import.meta.dirname, '..');

export interface ArchitectureCheckResult {
  readonly exitCode: number;
  readonly output: string;
}

function sourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'generated', 'frontend', 'backend'].includes(entry.name)) {
      continue;
    }
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...sourceFiles(path));
    } else if (/\.(?:ts|tsx)$/.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

function staticBoundaryViolations(root: string): string[] {
  const violations: string[] = [];
  const importPattern = /\b(?:from|import)\s*["']([^"']+)["']/g;

  for (const file of sourceFiles(root)) {
    const from = relative(root, file).replaceAll('\\', '/');
    const contents = readFileSync(file, 'utf8');
    for (const match of contents.matchAll(importPattern)) {
      const specifier = match[1];
      if (!specifier?.startsWith('.')) continue;
      const target = normalize(join(dirname(from), specifier))
        .replaceAll('\\', '/')
        .replace(/\.js$/, '.ts');
      const sourceModule = from.match(/^apps\/api\/src\/modules\/([^/]+)\//)?.[1];
      const targetInfrastructureModule = target.match(
        /^apps\/api\/src\/modules\/([^/]+)\/infrastructure(?:\/|$)/,
      )?.[1];

      if (from.startsWith('apps/web/src') && target.startsWith('apps/api/src')) {
        violations.push(`web-to-api-internal: ${from} -> ${target}`);
      } else if (
        from.startsWith('apps/api/src') &&
        (target.startsWith('apps/web/src') || target.startsWith('packages/ui/src'))
      ) {
        violations.push(`api-to-web-ui-feature: ${from} -> ${target}`);
      } else if (
        from.startsWith('packages/domain/src') &&
        /^(node:|.*\/(?:pg|express|drizzle-orm)(?:\/|$))/.test(target)
      ) {
        violations.push(`domain-to-infrastructure: ${from} -> ${target}`);
      } else if (from.startsWith('packages/contracts/src') && target.startsWith('apps/')) {
        violations.push(`contracts-to-apps: ${from} -> ${target}`);
      } else if (
        sourceModule &&
        targetInfrastructureModule &&
        sourceModule !== targetInfrastructureModule
      ) {
        violations.push(`module-to-module-infrastructure: ${from} -> ${target}`);
      }
    }
  }

  return violations;
}

export function runArchitectureCheck(
  root = repositoryRoot,
): ArchitectureCheckResult {
  const command = process.execPath;
  const result = spawnSync(
    command,
    [
      resolve(repositoryRoot, 'node_modules/dependency-cruiser/bin/dependency-cruise.mjs'),
      'apps/**/*.ts',
      'apps/**/*.tsx',
      'packages/**/*.ts',
      'packages/**/*.tsx',
      '--config',
      resolve(repositoryRoot, '.dependency-cruiser.cjs'),
      '--validate',
      '--output-type',
      'err-long',
    ],
    {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
    },
  );

  const dependencyCruiserOutput = `${result.stdout ?? ''}${result.stderr ?? ''}${result.error?.message ?? ''}`;
  const staticOutput = staticBoundaryViolations(root).join('\n');
  const dependencyExitCode = result.status ?? 1;
  return {
    exitCode: dependencyExitCode !== 0 || staticOutput ? 1 : 0,
    output: [dependencyCruiserOutput, staticOutput].filter(Boolean).join('\n'),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = runArchitectureCheck();
  if (result.output.trim()) {
    process.stdout.write(result.output);
  }
  process.exitCode = result.exitCode;
}
