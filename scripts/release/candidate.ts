import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const shaPattern = /^[0-9a-f]{40}$/;
const execFileAsync = promisify(execFile);

export function verifyReleaseIdentity(input: Readonly<{
  releaseSha: string;
  gitHead: string;
  renderGitCommit?: string;
}>): Readonly<{ releaseSha: string }> {
  if (!shaPattern.test(input.releaseSha)) throw new Error('RELEASE_SHA must be an exact 40-character Git SHA');
  if (input.gitHead !== input.releaseSha) throw new Error('RELEASE_SHA does not match Git HEAD');
  if (input.renderGitCommit && input.renderGitCommit !== input.releaseSha) {
    throw new Error('RELEASE_SHA does not match Render Git commit');
  }
  return { releaseSha: input.releaseSha };
}

export async function verifyCandidate(input: Readonly<{
  root: string;
  releaseSha: string;
  gitHead: string;
  renderGitCommit?: string;
}>): Promise<Readonly<{ releaseSha: string }>> {
  const identity = verifyReleaseIdentity(input);
  const required = ['apps/web/dist/index.html', 'apps/api/dist/bootstrap/server.js'] as const;
  for (const path of required) {
    try { await access(resolve(input.root, path)); }
    catch { throw new Error(`candidate build output is missing: ${path}`); }
  }
  const apiEntryPoint = pathToFileURL(resolve(input.root, 'apps/api/dist/bootstrap/server.js')).href;
  try {
    await execFileAsync(process.execPath, ['--input-type=module', '--eval', `await import(${JSON.stringify(apiEntryPoint)})`], {
      cwd: input.root,
      encoding: 'utf8',
    });
  } catch (error: unknown) {
    const failure = error as { readonly message?: string; readonly stderr?: string };
    const detail = [failure.message, failure.stderr].filter(Boolean).join('\n');
    throw new Error(`candidate API runtime import failed: ${detail}`, { cause: error });
  }
  return identity;
}
