import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

export function auditEnvironmentExample(content: string): readonly string[] {
  const failures: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    const value = line.trim();
    if (!value || value.startsWith('#')) continue;
    const match = value.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match) failures.push('environment example contains an invalid line');
    else if (match[2]) failures.push(`${match[1]} must not contain a committed value`);
  }
  return failures;
}

export function findSecretCandidates(content: string): readonly string[] {
  const candidates: string[] = [];
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content)) candidates.push('private-key');
  if (/\bAKIA[0-9A-Z]{16}\b/.test(content)) candidates.push('aws-access-key');
  if (/\bgh[pousr]_[A-Za-z0-9]{20,}\b/.test(content)) candidates.push('github-token');
  if (/\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/.test(content)) candidates.push('api-key');
  return candidates;
}

function trackedFiles(): readonly string[] {
  const result = spawnSync('git', ['ls-files', '-z'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status !== 0) throw new Error('git tracked-file inventory failed');
  return result.stdout.split('\0').filter(Boolean);
}

export async function runConfigAudit(): Promise<readonly string[]> {
  const failures = [...auditEnvironmentExample(await readFile(resolve('.env.v2.example'), 'utf8'))];
  for (const file of trackedFiles()) {
    if (file.endsWith('package-lock.json') || file.endsWith('.png') || file.endsWith('.jpg')) continue;
    const content = await readFile(resolve(file), 'utf8').catch(() => '');
    const candidates = findSecretCandidates(content);
    if (candidates.length) failures.push(`${file} contains ${candidates.join(',')}`);
  }
  return failures;
}
