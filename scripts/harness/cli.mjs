#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkDiff, renderIndex, validate } from './lib.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const [command, flag, base, ...extra] = process.argv.slice(2);
if (
  !['check', 'index'].includes(command) ||
  extra.length ||
  (flag !== undefined && (command !== 'check' || flag !== '--base' || !base))
) {
  console.error(
    'Usage: node scripts/harness/cli.mjs <check [--base <commit>]|index>',
  );
  process.exitCode = 2;
} else {
  try {
    const { features, errors } = validate(root);
    if (base) errors.push(...checkDiff(root, base));
    if (errors.length) {
      console.error(
        `Harness GAGAL:\n${errors.map((error) => `- ${error}`).join('\n')}`,
      );
      process.exitCode = 1;
    } else if (command === 'index') {
      writeFileSync(
        new URL('../../harness/INDEX.md', import.meta.url),
        renderIndex(root, features),
      );
      console.log('harness/INDEX.md diregenerasi.');
    } else {
      console.log(
        `Harness OK — ${features.length} tracker valid${base ? ', diff gate lulus' : ' (state lint; tanpa diff gate)'}.`,
      );
    }
  } catch (error) {
    console.error(`Harness GAGAL: ${error.message}`);
    process.exitCode = 1;
  }
}
