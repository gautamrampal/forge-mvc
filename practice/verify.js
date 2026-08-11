#!/usr/bin/env node
/**
 * Checks that every `// → expected` comment in the chapters matches what the
 * code ACTUALLY prints.
 *
 *   node practice/verify.js          # all chapters
 *   node practice/verify.js 07       # one chapter
 *
 * The convention each chapter follows:
 *   console.log('\n## 1.2 Section title');   ← navigation, ignored here
 *   console.log(expr);              // → exact expected output
 *
 * So the Nth annotated line must equal the Nth non-heading output line.
 * If you edit a chapter and the comment no longer matches, this tells you.
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

let totalChecked = 0;
let totalBad = 0;

for (const file of files) {
  const full = path.join(dir, file);

  const expected = fs
    .readFileSync(full, 'utf8')
    .split('\n')
    .map((line, i) => {
      const m = line.match(/\/\/\s*→\s?(.*)$/);
      return m ? { line: i + 1, want: m[1].trimEnd() } : null;
    })
    .filter(Boolean);

  const res = spawnSync(process.execPath, [full], { encoding: 'utf8' });
  if (res.status !== 0) {
    console.log(`\n✗ ${file} — exited ${res.status}`);
    console.log(res.stderr.split('\n').slice(0, 6).join('\n'));
    totalBad++;
    continue;
  }

  const actual = res.stdout
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l !== '' && !l.startsWith('##'));

  const bad = [];
  const n = Math.max(expected.length, actual.length);
  for (let i = 0; i < n; i++) {
    const want = expected[i]?.want;
    const got = actual[i];
    if (want === undefined) {
      bad.push(`  output line ${i + 1} has no // → comment:\n      got  ${got}`);
    } else if (got === undefined) {
      bad.push(`  ${file}:${expected[i].line} annotated but nothing printed:\n      want ${want}`);
    } else if (want !== got) {
      bad.push(`  ${file}:${expected[i].line}\n      want ${want}\n      got  ${got}`);
    }
  }

  totalChecked += expected.length;
  if (bad.length === 0) {
    console.log(`✓ ${file.padEnd(30)} ${expected.length} annotations verified`);
  } else {
    totalBad += bad.length;
    console.log(`✗ ${file.padEnd(30)} ${bad.length} mismatch(es)`);
    for (const b of bad.slice(0, 12)) console.log(b);
    if (bad.length > 12) console.log(`  ...and ${bad.length - 12} more`);
  }
}

console.log('\n' + '─'.repeat(70));
console.log(
  totalBad === 0
    ? `  ${totalChecked} annotations across ${files.length} chapters — all match real output`
    : `  ${totalBad} mismatch(es) — the comments and the code disagree`
);
console.log('─'.repeat(70) + '\n');
process.exit(totalBad === 0 ? 0 : 1);
