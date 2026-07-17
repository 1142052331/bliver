import { resolve } from 'node:path';

import { FixtureSource } from './adapters/fixture-source.js';
import { loadConfig } from './config.js';
import { preflight } from './domain/preflight.js';

type Environment = Readonly<Record<string, string | undefined>>;

export async function runCli(args: readonly string[], environment: Environment, print: (line: string) => void): Promise<number> {
  const command = args[0];
  if (command === 'preflight' && args.includes('--fixture')) {
    const index = args.indexOf('--fixture');
    const path = args[index + 1];
    if (!path) { print('FIXTURE_REQUIRED'); return 1; }
    const result = preflight(await (await FixtureSource.fromFile(resolve(path))).collections());
    print(JSON.stringify({ summary: result.summary, defaultedVisibilityCount: result.defaultedVisibilityCount, errors: result.errors }));
    return result.errors.length ? 1 : 0;
  }
  if (command === 'preflight' && args.includes('--source')) {
    const config = loadConfig(environment);
    if (!config.ok) { print(config.code); return 1; }
    print('SOURCE_ACCESS_REQUIRES_PHASE_B');
    return 1;
  }
  print('PHASE_B_SOURCE_REQUIRED');
  return 1;
}

if (process.argv[1]?.endsWith('cli.ts')) {
  runCli(process.argv.slice(2), process.env, (line) => process.stdout.write(`${line}\n`)).then((code) => { process.exitCode = code; });
}
