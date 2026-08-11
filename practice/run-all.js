#!/usr/bin/env node
/**
 * Run every practice file in order.
 *
 *   node practice/run-all.js            # everything
 *   node practice/run-all.js 02 08      # only files starting with 02 and 08
 *
 * Each file is a separate process, so one crash cannot hide the rest.
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const dir = __dirname;
const filters = process.argv.slice(2);

const files = fs
  .readdirSync(dir)
  .filter((f) => /^\d\d-.*\.js$/.test(f))
  .sort()
  .filter((f) => filters.length === 0 || filters.some((p) => f.startsWith(p)));

if (files.length === 0) {
  console.error(`No practice files matched: ${filters.join(', ')}`);
  process.exit(1);
}

let failed = 0;
for (const file of files) {
  const res = spawnSync(process.execPath, [path.join(dir, file)], { stdio: 'inherit' });
  if (res.status !== 0) {
    failed++;
    console.error(`\n!! ${file} exited with code ${res.status}\n`);
  }
}

console.log('\n' + '═'.repeat(74));
console.log(`  ${files.length - failed}/${files.length} practice files ran clean`);
console.log('═'.repeat(74) + '\n');
process.exit(failed === 0 ? 0 : 1);
