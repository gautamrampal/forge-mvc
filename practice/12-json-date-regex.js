/**
 * CHAPTER 12 — JSON, DATES, REGEX, MODULES
 *
 *   node practice/12-json-date-regex.js
 *
 * Four practical topics. Section 12.2 (what JSON silently destroys) and 12.7
 * (store UTC) between them account for a large share of real production bugs.
 */

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 12.1  JSON basics');
// ═══════════════════════════════════════════════════════════════════════════

const obj = { id: 1, name: 'Ann', tags: ['a'], active: true, meta: null };

console.log(JSON.stringify(obj));                // → {"id":1,"name":"Ann","tags":["a"],"active":true,"meta":null}
// The third argument is the indent. Shown escaped here so the real newlines
// are visible; printed plainly it would span three lines.
console.log(JSON.stringify(JSON.stringify({ a: 1 }, null, 2)));
                                                 // → "{\n  \"a\": 1\n}"
console.log(JSON.parse(JSON.stringify(obj)).name);   // → Ann

// Invalid JSON throws a SyntaxError — always wrap parse of untrusted input.
try {
  JSON.parse('{bad');
} catch (err) {
  console.log(err.constructor.name);             // → SyntaxError
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 12.2  What stringify SILENTLY destroys');
// ═══════════════════════════════════════════════════════════════════════════

const lossy = {
  fn: () => 1,
  undef: undefined,
  sym: Symbol('s'),
  date: new Date('2024-01-15T10:30:00Z'),
  inf: Infinity,
  nan: NaN,
  map: new Map([['a', 1]]),
  set: new Set([1, 2]),
  keep: 'me',
};

// Functions, undefined and symbols: the KEY disappears entirely.
// Infinity and NaN: become null.
// Date: becomes a string, and never comes back as a Date.
// Map and Set: become {} — the data is simply gone.
console.log(JSON.stringify(lossy));
// → {"date":"2024-01-15T10:30:00.000Z","inf":null,"nan":null,"map":{},"set":{},"keep":"me"}

console.log(typeof JSON.parse(JSON.stringify(lossy)).date);   // → string
console.log(JSON.parse(JSON.stringify(lossy)).map);           // → {}

// Convert Maps explicitly before serialising.
console.log(JSON.stringify({ map: Object.fromEntries(new Map([['a', 1]])) }));
                                                 // → {"map":{"a":1}}

// In an ARRAY, undefined becomes null rather than vanishing — because array
// indices cannot be skipped.
console.log(JSON.stringify([1, undefined, 3]));  // → [1,null,3]
console.log(JSON.stringify({ a: undefined }));   // → {}

// Two cases that throw rather than corrupt:
try {
  JSON.stringify({ n: 1n });
} catch (err) {
  console.log(err.constructor.name);             // → TypeError
}

const circular = { name: 'a' };
circular.self = circular;
try {
  JSON.stringify(circular);
} catch (err) {
  console.log(err.constructor.name);             // → TypeError
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 12.3  replacer and reviver');
// ═══════════════════════════════════════════════════════════════════════════

// An array replacer is an allowlist of keys.
console.log(JSON.stringify(obj, ['id', 'name']));    // → {"id":1,"name":"Ann"}

// A function replacer runs for every key — a one-line secret redactor.
console.log(
  JSON.stringify({ user: 'ann', password: 'x', token: 'y' }, (k, v) =>
    ['password', 'token'].includes(k) ? '[redacted]' : v
  )
);                                               // → {"user":"ann","password":"[redacted]","token":"[redacted]"}

// A reviver runs on the way IN — this is how you restore Dates.
const revived = JSON.parse('{"created":"2024-01-15T10:30:00.000Z","n":1}', (k, v) =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) ? new Date(v) : v
);
console.log(revived.created instanceof Date);    // → true
console.log(revived.created.getUTCFullYear());   // → 2024

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 12.4  Deep clone: JSON vs structuredClone');
// ═══════════════════════════════════════════════════════════════════════════

const source = { d: new Date(0), m: new Map([['k', 1]]), nested: { x: 1 } };

console.log(typeof JSON.parse(JSON.stringify(source)).d);   // → string
console.log(structuredClone(source).d instanceof Date);     // → true
console.log(structuredClone(source).m instanceof Map);      // → true

// structuredClone handles cycles too, but cannot clone functions.
try {
  structuredClone({ fn: () => 1 });
} catch (err) {
  console.log(err.constructor.name);             // → DOMException
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 12.5  Creating dates');
// ═══════════════════════════════════════════════════════════════════════════

const d = new Date('2024-01-15T10:30:00Z');
console.log(d.toISOString());                    // → 2024-01-15T10:30:00.000Z
console.log(d.getTime());                        // → 1705314600000
console.log(new Date(0).toISOString());          // → 1970-01-01T00:00:00.000Z

// The month argument is ZERO-BASED. 0 is January, 11 is December.
console.log(new Date(Date.UTC(2024, 0, 15)).toISOString());    // → 2024-01-15T00:00:00.000Z
console.log(new Date(Date.UTC(2024, 11, 25)).toISOString());   // → 2024-12-25T00:00:00.000Z

// A date-only string is parsed as UTC; adding a time but no Z makes it LOCAL.
// That inconsistency is a genuine spec quirk, not a Node bug.
console.log(new Date('2024-01-15').toISOString());   // → 2024-01-15T00:00:00.000Z
console.log(new Date('2024-01-15T00:00').getHours()); // → 0

// An unparseable date does not throw — it produces an Invalid Date.
console.log(String(new Date('not a date')));     // → Invalid Date
console.log(Number.isNaN(new Date('nope').getTime()));   // → true

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 12.6  Reading, formatting, arithmetic');
// ═══════════════════════════════════════════════════════════════════════════

console.log(d.getUTCFullYear());                 // → 2024
console.log(d.getUTCMonth());                    // → 0
console.log(d.getUTCDate());                     // → 15
console.log(d.getUTCDay());                      // → 1

console.log(d.toISOString().slice(0, 10));       // → 2024-01-15
console.log(d.toLocaleDateString('en-IN', { timeZone: 'UTC' }));   // → 15/1/2024
console.log(new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'UTC' }).format(d));
                                                 // → 15 Jan 2024

// Arithmetic is milliseconds. Subtracting two dates gives a number.
const DAY = 86400000;
console.log(new Date(d.getTime() + 7 * DAY).toISOString().slice(0, 10));   // → 2024-01-22
console.log((new Date('2024-01-20T10:30:00Z') - d) / DAY);                 // → 5

// The setters MUTATE. Clone first if the original is shared.
const mutable = new Date('2024-01-15T00:00:00Z');
const cloned = new Date(mutable);
mutable.setUTCDate(mutable.getUTCDate() + 30);   // rolls into the next month
console.log(mutable.toISOString().slice(0, 10)); // → 2024-02-14
console.log(cloned.toISOString().slice(0, 10));  // → 2024-01-15

// A relative-time helper, the kind every app ends up needing.
function ago(then, now) {
  const secs = Math.floor((now - then) / 1000);
  const units = [[86400, 'day'], [3600, 'hour'], [60, 'minute']];
  for (const [size, label] of units) {
    if (secs >= size) {
      const n = Math.floor(secs / size);
      return `${n} ${label}${n > 1 ? 's' : ''} ago`;
    }
  }
  return 'just now';
}
const now = new Date('2024-01-15T12:30:00Z');
console.log(ago(new Date('2024-01-15T10:30:00Z'), now));   // → 2 hours ago
console.log(ago(new Date('2024-01-12T12:30:00Z'), now));   // → 3 days ago
console.log(ago(new Date('2024-01-15T12:29:30Z'), now));   // → just now

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 12.7  Store UTC. Always.');
// ═══════════════════════════════════════════════════════════════════════════

// This machine's offset from UTC, in minutes, negated (IST is -330).
console.log(typeof new Date().getTimezoneOffset());   // → number

// Store toISOString() and convert only when RENDERING, in the user's zone.
console.log(d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }));   // → 15/1/2024, 4:00:00 pm
console.log(d.toLocaleString('en-IN', { timeZone: 'UTC' }));            // → 15/1/2024, 10:30:00 am

// Not theoretical: in the ticket portal the MySQL connection defaulted to
// system time (IST) while the app rendered UTC, so a ticket created seconds
// ago displayed an age of "-1 day". The fix was pinning the connection
// timezone to '+00:00'.

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 12.8  Regex — matching');
// ═══════════════════════════════════════════════════════════════════════════

const text = 'Call 555-1234 or 555-9876 today';

console.log(/\d{3}-\d{4}/.test(text));           // → true

// Without /g, .match returns the full match plus each capture group.
console.log(text.match(/(\d{3})-(\d{4})/).slice(0, 3));
                                                 // → [ '555-1234', '555', '1234' ]

// With /g it returns every match, but no groups.
console.log(text.match(/\d{3}-\d{4}/g));         // → [ '555-1234', '555-9876' ]

// matchAll gives you both.
console.log([...text.matchAll(/(\d{3})-(\d{4})/g)].map((m) => m[2]));
                                                 // → [ '1234', '9876' ]

// No match returns null, NOT an empty array — always guard before using it.
console.log(text.match(/zzz/));                  // → null
console.log((text.match(/zzz/) || []).length);   // → 0

// Named groups are far more readable than m[1], m[2], m[3].
const m = '2024-01-15'.match(/(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})/);
console.log(m.groups.year);                      // → 2024
console.log(Object.keys(m.groups));              // → [ 'year', 'month', 'day' ]

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 12.9  Regex — replacing, flags, classes');
// ═══════════════════════════════════════════════════════════════════════════

console.log('John Smith'.replace(/(\w+) (\w+)/, '$2, $1'));      // → Smith, John
console.log('2024-01-15'.replace(/(?<y>\d+)-(?<m>\d+)-(?<d>\d+)/, '$<d>/$<m>/$<y>'));
                                                 // → 15/01/2024
console.log('a1b2'.replace(/\d/g, (digit) => digit * 2));        // → a2b4

// The flags worth knowing: g i m s u
console.log('aaa'.match(/a/g).length);           // → 3
console.log(/abc/i.test('ABC'));                 // → true
console.log('a\nb'.match(/^b$/m) !== null);      // → true
console.log(/a.b/s.test('a\nb'));                // → true
console.log(/\u{1F44B}/u.test('👋'));            // → true

// Quantifiers: greedy by default, lazy with ?
console.log('<a><b>'.match(/<.+>/)[0]);          // → <a><b>
console.log('<a><b>'.match(/<.+?>/)[0]);         // → <a>

console.log('the cat sat'.match(/\bcat\b/)[0]);  // → cat
console.log('a b'.split(/\s+/));                 // → [ 'a', 'b' ]

// A few validators. Note the email one is deliberately loose — a strict
// RFC-compliant email regex is famously enormous and still rejects valid
// addresses. Validate the shape, then send a confirmation mail.
console.log(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test('a@b.co'));   // → true
console.log(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test('a@b'));      // → false
console.log(/^[6-9]\d{9}$/.test('9876543210'));             // → true
console.log(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test('Passw0rdX'));   // → true

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 12.10  Two regex traps');
// ═══════════════════════════════════════════════════════════════════════════

// 1. NEVER build a pattern from raw user input — it can throw, or match
//    something you did not intend.
try {
  new RegExp('(');
} catch (err) {
  console.log(err.constructor.name);             // → SyntaxError
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
console.log(new RegExp(escapeRe('(')).test('a(b'));   // → true
console.log(escapeRe('100% (net)'));                  // → 100% \(net\)

// 2. A /g regex REMEMBERS where it stopped, in .lastIndex. Calling .test()
//    repeatedly on the SAME string walks forward and eventually fails.
const g = /a/g;
console.log(`${g.test('aa')} lastIndex=${g.lastIndex}`);   // → true lastIndex=1
console.log(`${g.test('aa')} lastIndex=${g.lastIndex}`);   // → true lastIndex=2
console.log(`${g.test('aa')} lastIndex=${g.lastIndex}`);   // → false lastIndex=0

// Fix: drop the /g for .test(), or reset lastIndex before each use.
console.log(/a/.test('aa') && /a/.test('aa'));   // → true

// Also avoid nested quantifiers on user input: /(a+)+$/ against a long
// non-matching string can hang the event loop for minutes (ReDoS), freezing
// every request in the process.

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 12.11  Modules (CommonJS — what Forge uses)');
// ═══════════════════════════════════════════════════════════════════════════

// Exporting:
//   module.exports = MyClass;                one thing
//   module.exports = { helperA, helperB };   several
//   exports.helperA = helperA;               incrementally
//
//   ⚠️  exports = {...}  does NOT work — it only rebinds the local variable.
//       Always assign to module.exports.

console.log(typeof require('node:path').join);   // → function
console.log(typeof __dirname);                   // → string

// require is CACHED: the same object comes back every time. A module's
// top-level code runs ONCE per process.
console.log(require('node:path') === require('node:path'));   // → true

// That caching is why a DB pool created at module top level is shared by
// every request — correct for a pool, and a bug for per-request state. Use
// AsyncLocalStorage for the latter (see core/context.js).

//                     CommonJS (.js)        ESM (.mjs / "type":"module")
//   import            require('x')          import x from 'x'
//   export            module.exports = x    export default x
//   loading           synchronous           asynchronous
//   __dirname         available             import.meta.dirname
//   top-level await   no                    yes
//
// You can always load an ESM-only package from CommonJS with a dynamic
// import — which is exactly how Forge loads the ESM-only 'file-type':
//
//   const mod = await import('some-esm-only-package');

console.log(typeof import('node:path').then);    // → function

/**
 * SUMMARY
 *
 *   JSON drops         functions, undefined, symbols     (key vanishes)
 *   JSON mangles       Infinity/NaN → null, Date → string, Map/Set → {}
 *   JSON throws        BigInt, circular references
 *   replacer           allowlist array, or a redact function
 *   structuredClone    real deep copy; keeps Date/Map/Set; no functions
 *
 *   Date.UTC(y, 0, d)  month is ZERO-based
 *   invalid date       Number.isNaN(d.getTime()) — it does not throw
 *   setters mutate     clone with new Date(other) first
 *   store UTC          convert only when rendering
 *
 *   str.match(re)      null when no match — guard it
 *   /g + .test()       stateful via lastIndex; drop /g or reset it
 *   user input         escape before new RegExp; beware nested quantifiers
 *
 *   module.exports     never bare `exports =`
 *   require            cached; top-level code runs once per process
 *
 * That is the whole course. Now: node practice/exercises.js
 */
