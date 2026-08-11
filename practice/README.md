# practice/

A standalone JavaScript course. No database, no server, no install — just Node.

```bash
node practice/01-values-and-types.js     # one chapter
node practice/run-all.js                 # every chapter
node practice/run-all.js 02 08           # only these
node practice/exercises.js               # 39 self-checking exercises
node practice/verify.js                  # check the comments against reality
```

The written companion is [../TUTORIAL-JS-ESSENTIALS.md](../TUTORIAL-JS-ESSENTIALS.md).

## The twelve chapters

| # | File | Topic |
|---|---|---|
| 01 | `01-values-and-types.js` | primitives, truthiness, `==` coercion, references, `const` |
| 02 | `02-arrays.js` | mutating vs non-mutating, `map`/`filter`/`reduce`, destructuring |
| 03 | `03-objects.js` | iteration, shallow copying, destructuring, `?.` and `??`, `this` |
| 04 | `04-map-set.js` | Map vs object, Set, set algebra, WeakMap |
| 05 | `05-loops-and-iteration.js` | every loop, the iteration protocol, generators, `for await` |
| 06 | `06-functions.js` | declarations, parameters, closures, higher-order functions, `bind` |
| 07 | `07-arrow-functions.js` | every syntax form, the four differences, when arrows are wrong |
| 08 | `08-promises.js` | combinators, parallel vs sequential, concurrency, the event loop |
| 09 | `09-strings-and-numbers.js` | templates, Unicode, floats, parsing user input |
| 10 | `10-classes.js` | fields, `#private`, inheritance, prototypes, `toJSON` |
| 11 | `11-errors.js` | custom errors, `cause`, async errors, retry, debugging |
| 12 | `12-json-date-regex.js` | serialisation, UTC dates, regex, CommonJS vs ESM |

Then `exercises.js` — every function starts stubbed. Fill them in and re-run until the summary
reads `39/39 passing`. Annotated solutions are in `exercises.solutions.js`.

## How to read a chapter

Each one is ordinary JavaScript. The result of every line is in a comment beside it:

```js
console.log([10, 9, 100].sort());               // → [ 1, 10, 100, 9 ]
console.log([10, 9, 100].sort((a, b) => a - b)); // → [ 9, 10, 100 ]
```

Run the file and you get exactly those values, in that order, under a `##` heading per section.
So you can read it as a document, run it as a program, or edit it as a sandbox.

## verify.js

Because the comments *are* the answers, a wrong comment would teach the wrong thing silently.
`node practice/verify.js` runs every chapter and checks all 745 annotations against real output:

```
✓ 01-values-and-types.js         63 annotations verified
✓ 02-arrays.js                   77 annotations verified
...
  745 annotations across 12 chapters — all match real output
```

Run it after editing a chapter. If you change a line and forget its comment, it will tell you.

Two formatting conventions exist only to keep that check honest: printed arrays are kept to six
or fewer elements, and long ones are `.join()`ed — Node wraps larger arrays across several lines,
which would break the one-line-per-annotation match.

## How to actually learn from these

Reading is the smallest part. Edit them:

- change a value and predict the new output **before** re-running
- delete the fix under a `⚠️` comment and watch the bug come back
- add your own `console.log` lines anywhere

Then do the exercises without looking at the solutions.
