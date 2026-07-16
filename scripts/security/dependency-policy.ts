import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

export interface DependencyException {
  readonly advisory: string;
  readonly owner: string;
  readonly reason: string;
  readonly reviewDate: string;
}

export function validateDependencyExceptions(exceptions: readonly DependencyException[], now = new Date()): readonly string[] {
  const failures: string[] = [];
  const today = now.toISOString().slice(0, 10);
  for (const exception of exceptions) {
    if (!exception.owner.trim()) failures.push(`${exception.advisory} exception owner is required`);
    if (!exception.reason.trim()) failures.push(`${exception.advisory} exception reason is required`);
    const formatted = /^\d{4}-\d{2}-\d{2}$/.test(exception.reviewDate);
    const parsed = formatted ? new Date(`${exception.reviewDate}T00:00:00.000Z`) : null;
    const valid = parsed && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === exception.reviewDate;
    if (!valid) failures.push(`${exception.advisory} exception review date ${exception.reviewDate || '<missing>'} must be a valid YYYY-MM-DD UTC date`);
    else if (exception.reviewDate < today) failures.push(`${exception.advisory} exception review date ${exception.reviewDate} expired before ${today} UTC`);
  }
  return failures;
}

interface AuditReport { readonly vulnerabilities?: Record<string, { readonly via?: readonly (string | { readonly source?: number | string; readonly url?: string })[] }> }

function npmAudit(args: readonly string[], exceptions: ReadonlySet<string>): boolean {
  const npmCli = process.env.npm_execpath;
  const result = npmCli
    ? spawnSync(process.execPath, [npmCli, 'audit', ...args], { encoding: 'utf8', stdio: 'pipe', timeout: 120_000 })
    : spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['audit', ...args], { encoding: 'utf8', stdio: 'pipe', timeout: 120_000, shell: process.platform === 'win32' });
  if (result.status === 0) return true;
  try {
    const report = JSON.parse(result.stdout) as AuditReport;
    const advisoryIds = Object.values(report.vulnerabilities ?? {}).flatMap((item) => (item.via ?? []).flatMap((entry) => {
      if (typeof entry === 'string') return [];
      const fromUrl = entry.url?.match(/GHSA-[A-Za-z0-9-]+/)?.[0];
      return [fromUrl ?? String(entry.source ?? '')];
    })).filter(Boolean);
    return advisoryIds.length > 0 && advisoryIds.every((advisory) => exceptions.has(advisory));
  } catch { return false; }
}

export async function runDependencyPolicy(): Promise<readonly string[]> {
  const exceptions = JSON.parse(await readFile(resolve('scripts/security/dependency-exceptions.json'), 'utf8')) as DependencyException[];
  const failures = [...validateDependencyExceptions(exceptions)];
  const advisoryIds = new Set(exceptions.map((exception) => exception.advisory));
  if (!npmAudit(['--audit-level=high', '--omit=dev', '--json'], advisoryIds)) failures.push('root production dependency audit failed');
  if (!npmAudit(['--workspaces', '--audit-level=high', '--omit=dev', '--json'], advisoryIds)) failures.push('workspace production dependency audit failed');
  return failures;
}
