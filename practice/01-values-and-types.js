/**
 * CHAPTER 01 — VALUES & TYPES
 *
 *   node practice/01-values-and-types.js
 *
 * Where JavaScript disagrees with PHP most sharply. Truthiness and equality
 * are the two that will cost you the most debugging time, so they get the
 * most space here.
 */

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 1.1  Seven primitives, plus objects');
// ═══════════════════════════════════════════════════════════════════════════

// Primitives are immutable and compared BY VALUE.
console.log(typeof 'hi');                    // → string
console.log(typeof 42);                      // → number
console.log(typeof 42n);                     // → bigint
console.log(typeof true);                    // → boolean
console.log(typeof undefined);               // → undefined
console.log(typeof Symbol('id'));            // → symbol

// `null` reports as "object". A bug from 1995, kept forever for compatibility.
console.log(typeof null);                    // → object

// Everything else is an object — including arrays and functions.
console.log(typeof {});                      // → object
console.log(typeof []);                      // → object
console.log(typeof function () {});          // → function

// So `typeof` cannot detect an array. Use this instead:
console.log(Array.isArray([]));              // → true
console.log(Array.isArray({}));              // → false

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 1.2  null vs undefined');
// ═══════════════════════════════════════════════════════════════════════════

// undefined = "never given a value" (the language sets this)
// null      = "deliberately empty"  (you set this)

let neverSet;
console.log(neverSet);                       // → undefined
console.log({}.missingKey);                  // → undefined
console.log((function () {})());             // → undefined

const deliberatelyEmpty = null;
console.log(deliberatelyEmpty);              // → null

// They are loosely equal to each other and to NOTHING else. That makes
// `x == null` the one genuinely useful loose comparison: it catches both.
console.log(null == undefined);              // → true
console.log(null === undefined);             // → false
console.log(null == 0);                      // → false

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 1.3  Truthiness — exactly eight falsy values');
// ═══════════════════════════════════════════════════════════════════════════

// false, 0, -0, 0n, "", null, undefined, NaN.  EVERYTHING else is truthy.
const allFalsy = [false, 0, -0, 0n, '', null, undefined, NaN];
console.log(allFalsy.every((v) => !v));      // → true

// The four that trip up PHP developers:
console.log(Boolean('0'));                   // → true
console.log(Boolean('false'));               // → true
console.log(Boolean([]));                    // → true
console.log(Boolean({}));                    // → true

// A single space is not empty:
console.log(Boolean(' '));                   // → true

// Practical consequence: NEVER test an array for emptiness with `!arr`.
const empty = [];
console.log(!empty);                         // → false
console.log(empty.length === 0);             // → true

// Same for objects — check the key count, not the object.
console.log(Object.keys({}).length === 0);   // → true

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 1.4  == coerces, and is not even transitive');
// ═══════════════════════════════════════════════════════════════════════════

console.log('5' == 5);                       // → true
console.log('5' === 5);                      // → false

// Watch these three lines together. If == were an equivalence relation,
// the third would have to be true. It is not.
console.log(0 == '');                        // → true
console.log(0 == '0');                       // → true
console.log('' == '0');                      // → false

// Arrays coerce through their string form, which is rarely what you meant.
console.log([] == false);                    // → true
console.log([] == '');                       // → true
console.log([1] == 1);                       // → true

// Rule: always ===. The single exception is `x == null` (see 1.2).

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 1.5  NaN');
// ═══════════════════════════════════════════════════════════════════════════

// NaN is the only value not equal to itself.
console.log(NaN === NaN);                    // → false
console.log(Number.isNaN(NaN));              // → true
console.log(Object.is(NaN, NaN));            // → true

// Beware the global isNaN: it coerces first, so it answers a different question.
console.log(isNaN('abc'));                   // → true
console.log(Number.isNaN('abc'));            // → false

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 1.6  Converting types on purpose');
// ═══════════════════════════════════════════════════════════════════════════

console.log(Number('42'));                   // → 42
console.log(Number('42abc'));                // → NaN
console.log(parseInt('42abc', 10));          // → 42
console.log(parseFloat('3.14xyz'));          // → 3.14

// These three all produce 0, which is a frequent source of silent bugs.
console.log(Number(''));                     // → 0
console.log(Number(null));                   // → 0
console.log(Number([]));                     // → 0

// undefined is the exception:
console.log(Number(undefined));              // → NaN

console.log(String(42));                     // → 42
console.log((42).toString(2));               // → 101010
console.log(+'42');                          // → 42

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 1.7  Primitives copy, objects share');
// ═══════════════════════════════════════════════════════════════════════════

let a = 1;
let b = a;
b = 99;
console.log(a);                              // → 1

// An object variable holds a REFERENCE. Both names point at one object.
const o1 = { n: 1 };
const o2 = o1;
o2.n = 99;
console.log(o1.n);                           // → 99

// Which is why objects compare by identity, not by contents.
console.log({ a: 1 } === { a: 1 });          // → false
console.log([1, 2] === [1, 2]);              // → false

const same = { a: 1 };
console.log(same === same);                  // → true

// A cheap (shallow, key-order-dependent) contents check:
console.log(JSON.stringify({ a: 1 }) === JSON.stringify({ a: 1 }));   // → true

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 1.8  const freezes the BINDING, not the value');
// ═══════════════════════════════════════════════════════════════════════════

const cfg = { debug: false };
cfg.debug = true;                            // fine — mutating the object
console.log(cfg.debug);                      // → true

try {
  eval('cfg = {}');                          // reassigning the name is not
} catch (err) {
  console.log(err.constructor.name);         // → TypeError
}

// Object.freeze blocks writes — but only one level deep.
const frozen = Object.freeze({ x: 1, nested: { y: 2 } });
frozen.x = 99;                               // silently ignored (throws in strict mode)
frozen.nested.y = 99;                        // NOT blocked — freeze is shallow
console.log(frozen.x);                       // → 1
console.log(frozen.nested.y);                // → 99
console.log(Object.isFrozen(frozen));        // → true

/**
 * SUMMARY
 *
 *   typeof null === 'object'        a permanent language bug
 *   Array.isArray(x)                the only correct array test
 *   8 falsy values                  false 0 -0 0n "" null undefined NaN
 *   Boolean("0") and Boolean([])    are TRUE — unlike PHP
 *   ===                             always; `x == null` is the one exception
 *   Number.isNaN                    not the global isNaN
 *   const                           the binding is fixed, the object is not
 *   Object.freeze                   shallow
 *
 * Next: 02-arrays.js
 */
