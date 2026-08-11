/**
 * CHAPTER 09 — STRINGS & NUMBERS
 *
 *   node practice/09-strings-and-numbers.js
 *
 * Two things here will bite you in real applications: Unicode length (9.7)
 * and parsing user input (9.11). Query strings and form fields arrive as
 * strings, always, and converting them badly is a common source of bugs.
 */

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 9.1  Template literals');
// ═══════════════════════════════════════════════════════════════════════════

const name = 'Ann';
const qty = 3;

console.log(`Hi ${name}`);                       // → Hi Ann
console.log(`total: ${qty * 2}`);                // → total: 6
console.log(`${qty > 1 ? 'items' : 'item'}`);    // → items
console.log(`outer ${`inner ${name}`}`);         // → outer inner Ann
console.log(`a \` b`);                           // → a ` b

// Multiline needs no concatenation and no \n.
console.log(`line1
line2`.split('\n').length);                      // → 2

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 9.2  Strings are immutable');
// ═══════════════════════════════════════════════════════════════════════════

let s = 'hello';
s[0] = 'H';                                      // silently does nothing
console.log(s);                                  // → hello

// Every "modification" returns a new string.
console.log('H' + s.slice(1));                   // → Hello

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 9.3  Reading and searching');
// ═══════════════════════════════════════════════════════════════════════════

const str = 'Hello World';

console.log(str.length);                         // → 11
console.log(str[0]);                             // → H
console.log(str.at(-1));                         // → d
console.log(str[99]);                            // → undefined

console.log(str.includes('World'));              // → true
console.log(str.startsWith('Hello'));            // → true
console.log(str.endsWith('d'));                  // → true
console.log(str.indexOf('o'));                   // → 4
console.log(str.lastIndexOf('o'));               // → 7

// Not found is -1, NOT null. `if (str.indexOf(x))` is therefore a bug: -1 is
// truthy and 0 (a real match at position 0) is falsy.
console.log(str.indexOf('zzz'));                 // → -1

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 9.4  slice vs substring');
// ═══════════════════════════════════════════════════════════════════════════

console.log(str.slice(0, 5));                    // → Hello
console.log(str.slice(6));                       // → World
console.log(str.slice(-5));                      // → World

// substring treats a negative index as 0 instead of counting from the end.
console.log(str.substring(-5));                  // → Hello World

// Rule: just use slice, always.

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 9.5  Transforming (all return new strings)');
// ═══════════════════════════════════════════════════════════════════════════

console.log(str.toUpperCase());                  // → HELLO WORLD
console.log(str.toLowerCase());                  // → hello world
console.log('  pad  '.trim());                   // → pad
console.log('  pad  '.trimStart() + '|');        // → pad  |
console.log('|' + '  pad  '.trimEnd());          // → |  pad

// replace changes only the FIRST occurrence unless you use a /g regex.
console.log('a-b-c'.replace('-', '+'));          // → a+b-c
console.log('a-b-c'.replaceAll('-', '+'));       // → a+b+c
console.log('a-b-c'.replace(/-/g, '+'));         // → a+b+c

console.log('ab'.repeat(3));                     // → ababab
console.log('42'.padStart(5, '0'));              // → 00042
console.log('42'.padEnd(5, '.'));                // → 42...

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 9.6  Splitting and joining');
// ═══════════════════════════════════════════════════════════════════════════

console.log('a,b,c'.split(','));                 // → [ 'a', 'b', 'c' ]
console.log('abc'.split(''));                    // → [ 'a', 'b', 'c' ]
console.log('a b c'.split(' ', 2));              // → [ 'a', 'b' ]
console.log('a , b,c'.split(/\s*,\s*/));         // → [ 'a', 'b', 'c' ]
console.log(['a', 'b'].join('-'));               // → a-b
console.log('a,b,c'.split(',').reverse().join('|'));   // → c|b|a

// A few one-liners you will write over and over:
const slugify = (t) => t.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
console.log(slugify('  Hello, World! 2024  '));  // → hello-world-2024

const titleCase = (t) => t.replace(/\b\w/g, (c) => c.toUpperCase());
console.log(titleCase('hello big world'));       // → Hello Big World

const truncate = (t, n) => (t.length > n ? t.slice(0, n - 1) + '…' : t);
console.log(truncate('a long sentence here', 10));    // → a long se…

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 9.7  Unicode — .length counts UTF-16 units, not characters');
// ═══════════════════════════════════════════════════════════════════════════

console.log('café'.length);                      // → 4

// An emoji outside the basic plane is stored as a SURROGATE PAIR: two units.
console.log('👋'.length);                        // → 2
console.log('👋'.split('').length);              // → 2

// Spread and Array.from iterate by code point, so they get it right.
console.log([...'👋'].length);                   // → 1
console.log(Array.from('a👋').length);           // → 2

// This matters for any length limit applied to user text — a 100-character
// cap using .length can cut an emoji in half and produce mojibake.

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 9.8  Comparing and sorting');
// ═══════════════════════════════════════════════════════════════════════════

console.log('a' < 'b');                          // → true

// Comparison is by code unit, so ALL uppercase sorts before ALL lowercase.
console.log('B' < 'a');                          // → true
console.log(['b', 'A', 'c'].sort());             // → [ 'A', 'b', 'c' ]

// localeCompare is the human-friendly ordering.
console.log(['b', 'A', 'c'].sort((x, y) => x.localeCompare(y)));   // → [ 'A', 'b', 'c' ]
console.log('B'.localeCompare('a'));             // → 1

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 9.9  One number type (plus BigInt)');
// ═══════════════════════════════════════════════════════════════════════════

// There is no int/float distinction. Every number is a 64-bit float.
console.log(typeof 1);                           // → number
console.log(typeof 1.5);                         // → number
console.log(1 === 1.0);                          // → true

console.log(Number.MAX_SAFE_INTEGER);            // → 9007199254740991

// Past that limit, integers stop being distinguishable.
console.log(Number.MAX_SAFE_INTEGER + 1 === Number.MAX_SAFE_INTEGER + 2);   // → true

// BigInt handles arbitrary integers, but never mixes with Number.
console.log(9007199254740991n + 2n);             // → 9007199254740993n
try {
  console.log(1n + 1);
} catch (err) {
  console.log(err.constructor.name);             // → TypeError
}
console.log(Number(1n) + 1);                     // → 2

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 9.10  Floating point');
// ═══════════════════════════════════════════════════════════════════════════

console.log(0.1 + 0.2);                          // → 0.30000000000000004
console.log(0.1 + 0.2 === 0.3);                  // → false

// Compare with a tolerance, or format for display.
console.log(Math.abs(0.1 + 0.2 - 0.3) < Number.EPSILON);   // → true
console.log((0.1 + 0.2).toFixed(2));             // → 0.30

// For money: store integer CENTS and divide only when rendering. Never let a
// float hold a currency amount.
console.log((1999 / 100).toFixed(2));            // → 19.99

// Special values
console.log(1 / 0);                              // → Infinity
console.log(-1 / 0);                             // → -Infinity
console.log(0 / 0);                              // → NaN
console.log(Number.isFinite(1 / 0));             // → false
console.log(Number.isInteger(1.0));              // → true
console.log(Number.isSafeInteger(2 ** 53));      // → false

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 9.11  Parsing user input');
// ═══════════════════════════════════════════════════════════════════════════

console.log(Number('42'));                       // → 42
console.log(Number('42px'));                     // → NaN
console.log(parseInt('42px', 10));               // → 42
console.log(parseInt('ff', 16));                 // → 255
console.log(parseFloat('3.14m'));                // → 3.14

// These four all yield 0, which is how empty input becomes a real-looking value.
console.log(Number(''));                         // → 0
console.log(Number(' '));                        // → 0
console.log(Number(null));                       // → 0
console.log(Number([]));                         // → 0

// The trap: `parseInt(v) || fallback` throws away a legitimate 0.
console.log(parseInt('0', 10) || 25);            // → 25

// Check explicitly instead.
function toInt(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? fallback : n;
}
console.log(toInt('abc', 25));                   // → 25
console.log(toInt('0', 25));                     // → 0
console.log(toInt('7', 25));                     // → 7

// (This is exactly the bug that made ?page_size=0 become 25 in this framework.)

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 9.12  Rounding and formatting');
// ═══════════════════════════════════════════════════════════════════════════

// Math.round breaks ties toward +Infinity, not away from zero.
console.log(Math.round(2.5));                    // → 3
console.log(Math.round(-2.5));                   // → -2

console.log(Math.floor(2.9));                    // → 2
console.log(Math.ceil(2.1));                     // → 3
console.log(Math.trunc(-2.9));                   // → -2

// toFixed returns a STRING. Prefix with + to get a number back.
console.log((3.14159).toFixed(2));               // → 3.14
console.log(typeof (3.14159).toFixed(2));        // → string
console.log(+(3.14159).toFixed(2));              // → 3.14

console.log((1234.5).toLocaleString('en-IN'));   // → 1,234.5
console.log((1234.5).toLocaleString('en-IN', { style: 'currency', currency: 'INR' }));
                                                 // → ₹1,234.50
console.log((255).toString(16));                 // → ff

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 9.13  Math and operators');
// ═══════════════════════════════════════════════════════════════════════════

console.log(Math.max(...[3, 9, 2]));             // → 9
console.log(Math.abs(-5));                       // → 5
console.log(2 ** 10);                            // → 1024
console.log(Math.sqrt(16));                      // → 4

// With no arguments these return the identity element, which is easy to hit
// accidentally when spreading an empty array.
console.log(Math.max());                         // → -Infinity
console.log(Math.min(...[]));                    // → Infinity

// + means concatenation if EITHER side is a string; every other operator
// converts to number instead.
console.log('5' + 3);                            // → 53
console.log('5' - 3);                            // → 2
console.log('5' * '2');                          // → 10
console.log(1 + 2 + '3');                        // → 33
console.log('1' + 2 + 3);                        // → 123

// % keeps the sign of the DIVIDEND, so it is a remainder, not a modulo.
console.log(10 % 3);                             // → 1
console.log(-10 % 3);                            // → -1
console.log(((-10 % 3) + 3) % 3);                // → 2

// There is no integer division.
console.log(7 / 2);                              // → 3.5
console.log(Math.trunc(7 / 2));                  // → 3

/**
 * SUMMARY
 *
 *   `text ${expr}`        template literal; backticks, multiline, no concat
 *   slice                 always; substring mishandles negatives
 *   replace / replaceAll  replace hits only the first match
 *   [...str]              code-point aware; .length is UTF-16 units
 *   localeCompare         human sort order; plain sort() puts A-Z before a-z
 *
 *   0.1 + 0.2 !== 0.3     store money as integer cents
 *   Number('')            0 — as are ' ', null and []
 *   parseInt(v) || d      loses a real 0; test Number.isNaN instead
 *   toFixed               returns a string
 *   -10 % 3               -1, not 2
 *
 * Next: 10-classes.js
 */
