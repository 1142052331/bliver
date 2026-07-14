import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { buildOpenApiDocument } from './openapi.js';

const root = resolve(import.meta.dirname, '../../..');
const outputDirectory = resolve(root, 'artifacts/openapi');

await mkdir(outputDirectory, { recursive: true });
await writeFile(
  resolve(outputDirectory, 'v2.json'),
  `${JSON.stringify(buildOpenApiDocument(), null, 2)}\n`,
  'utf8',
);
