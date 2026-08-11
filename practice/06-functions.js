/**
 * CHAPTER 06 — FUNCTIONS & CLOSURES
 *
 *   node practice/06-functions.js
 *
 * Everything here is about `function` and about closures. Arrow functions get
 * their own chapter next (07), because their differences deserve the room.
 */

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 6.1  Declarations, expressions, hoisting');
// ═══════════════════════════════════════════════════════════════════════════

// A DECLARATION is hoisted: the whole function exists before this line runs.
console.log(declared(2, 3));                     // → 5
function declared(a, b) {
  return a + b;
}

// An EXPRESSION assigns a function to a variable, so const/let rules apply.
const expressed = function (a, b) {
  return a + b;
};
console.log(expressed(2, 3));                    // → 5

// Naming a function expression helps stack traces; the name is only visible
// inside the function itself.
const named = function adder(a, b) {
  return a + b;
};
console.log(named(2, 3));                        // → 5
console.log(named.name);                         // → adder

// Using a const-bound function before its line throws.
try {
  notYet();
} catch (err) {
  console.log(err.constructor.name);             // → ReferenceError
}
const notYet = function () {
  return 1;
};

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 6.2  Parameters');
// ═══════════════════════════════════════════════════════════════════════════

// Defaults are evaluated at CALL time, left to right, so a later default can
// use an earlier parameter.
function withDefaults(a, b = 10, c = a + b) {
  return { a, b, c };
}
console.log(withDefaults(1));                    // → { a: 1, b: 10, c: 11 }
console.log(withDefaults(1, 2));                 // → { a: 1, b: 2, c: 3 }

// Only `undefined` triggers a default. `null` is a real value and passes through.
console.log(withDefaults(1, undefined));         // → { a: 1, b: 10, c: 11 }
console.log(withDefaults(1, null));              // → { a: 1, b: null, c: 1 }

// Rest gathers the remainder into a real array.
function rest(first, ...others) {
  return { first, others };
}
console.log(rest(1, 2, 3));                      // → { first: 1, others: [ 2, 3 ] }

// Spread does the reverse — an array becomes separate arguments.
console.log(Math.max(...[3, 9, 2]));             // → 9
console.log(Math.max(1, ...[3, 9], 4));          // → 9

// Missing arguments are undefined; extra ones are ignored.
console.log(declared(1));                        // → NaN
console.log(declared(1, 2, 99));                 // → 3

// `arguments` is an array-LIKE object available in any non-arrow function.
function usesArguments() {
  return { count: arguments.length, asArray: Array.from(arguments) };
}
console.log(usesArguments(1, 2));                // → { count: 2, asArray: [ 1, 2 ] }

// fn.length counts only parameters BEFORE the first default or rest.
console.log(((a, b) => 0).length);               // → 2
console.log(((a, b = 1) => 0).length);           // → 1
console.log(((a, ...r) => 0).length);            // → 1

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 6.3  Destructured parameters — the controller idiom');
// ═══════════════════════════════════════════════════════════════════════════

// The trailing `= {}` is what makes a no-argument call work. Without it,
// destructuring undefined throws.
function query({ table, where = {}, limit = 10 } = {}) {
  return { table, where, limit };
}
console.log(query({ table: 'users' }));          // → { table: 'users', where: {}, limit: 10 }
console.log(query());                            // → { table: undefined, where: {}, limit: 10 }

function noGuard({ a }) {
  return a;
}
try {
  noGuard();
} catch (err) {
  console.log(err.constructor.name);             // → TypeError
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 6.4  CLOSURES — a function remembers where it was born');
// ═══════════════════════════════════════════════════════════════════════════

// `count` lives on after makeCounter returns, because the returned functions
// still reference it. Nothing outside can reach it: this is real privacy.
function makeCounter() {
  let count = 0;
  return {
    inc: () => ++count,
    get: () => count,
  };
}

const c1 = makeCounter();
const c2 = makeCounter();
c1.inc();
c1.inc();
c2.inc();

console.log(c1.get());                           // → 2
console.log(c2.get());                           // → 1
console.log(c1.count);                           // → undefined

// The same idea as an immediately-invoked function — the module pattern,
// which is how JS did private state before classes had #fields.
const bank = (function () {
  let balance = 100;
  return {
    deposit: (n) => (balance += n),
    balance: () => balance,
  };
})();

bank.deposit(50);
console.log(bank.balance());                     // → 150
console.log(bank.balanceVariable);               // → undefined

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 6.5  Higher-order functions');
// ═══════════════════════════════════════════════════════════════════════════

// A function that takes a function...
function applyTwice(fn, x) {
  return fn(fn(x));
}
console.log(applyTwice((v) => v + 3, 10));       // → 16

// ...and a function that returns one. This is how middleware factories work.
function withLogging(fn) {
  return function (...args) {
    const result = fn(...args);
    return `${fn.name}(${args}) = ${result}`;
  };
}
console.log(withLogging(declared)(2, 3));        // → declared(2,3) = 5

// Currying / partial application
const multiply = (a) => (b) => a * b;
console.log(multiply(2)(5));                     // → 10

const doubleIt = multiply(2);
console.log(doubleIt(7));                        // → 14

const partial = (fn, ...preset) => (...later) => fn(...preset, ...later);
console.log(partial(declared, 10)(5));           // → 15

// pipe runs left to right, compose right to left. Both are just reduce.
const pipe = (...fns) => (x) => fns.reduce((acc, fn) => fn(acc), x);
const compose = (...fns) => (x) => fns.reduceRight((acc, fn) => fn(acc), x);
const inc = (x) => x + 1;
const dbl = (x) => x * 2;

console.log(pipe(inc, dbl)(5));                  // → 12
console.log(compose(inc, dbl)(5));               // → 11

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 6.6  Two decorators worth memorising');
// ═══════════════════════════════════════════════════════════════════════════

// memoize — cache results per argument. The Map lives in the closure.
let realCalls = 0;
function memoize(fn) {
  const cache = new Map();
  return (n) => {
    if (cache.has(n)) return cache.get(n);
    const value = fn(n);
    cache.set(n, value);
    return value;
  };
}
const square = memoize((n) => {
  realCalls++;
  return n * n;
});

square(4);
square(4);
square(4);
console.log(square(4));                          // → 16
console.log(realCalls);                          // → 1

// once — run at most one time, then always return the first result.
function once(fn) {
  let called = false;
  let result;
  return (...args) => {
    if (!called) {
      called = true;
      result = fn(...args);
    }
    return result;
  };
}
let initCount = 0;
const init = once(() => ++initCount);
init();
init();
init();
console.log(initCount);                          // → 1

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 6.7  call, apply, bind');
// ═══════════════════════════════════════════════════════════════════════════

function intro(greeting, punctuation) {
  return `${greeting}, ${this.name}${punctuation}`;
}
const person = { name: 'Ann' };

console.log(intro.call(person, 'Hi', '!'));      // → Hi, Ann!
console.log(intro.apply(person, ['Hi', '?']));   // → Hi, Ann?

// bind returns a NEW function with `this` (and any preset args) locked in.
const bound = intro.bind(person, 'Hey');
console.log(bound('.'));                         // → Hey, Ann.

// A bound function cannot be re-bound — the first binding wins permanently.
console.log(bound.call({ name: 'Other' }, '.')); // → Hey, Ann.

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 6.8  Recursion');
// ═══════════════════════════════════════════════════════════════════════════

function factorial(n) {
  return n <= 1 ? 1 : n * factorial(n - 1);
}
console.log(factorial(6));                       // → 720

// Recursion is the natural fit for nested data of unknown depth.
function flatten(arr) {
  return arr.reduce((acc, v) => acc.concat(Array.isArray(v) ? flatten(v) : v), []);
}
console.log(flatten([1, [2, [3, [4]]]]));        // → [ 1, 2, 3, 4 ]

function deepGet(obj, path) {
  return path.split('.').reduce((acc, k) => acc?.[k], obj);
}
console.log(deepGet({ a: { b: { c: 42 } } }, 'a.b.c'));   // → 42
console.log(deepGet({ a: 1 }, 'x.y.z'));                  // → undefined

// The stack is finite, and JS engines do not optimise tail calls.
try {
  const boom = () => boom();
  boom();
} catch (err) {
  console.log(err.constructor.name);             // → RangeError
}

/**
 * SUMMARY
 *
 *   function declared() {}      hoisted — callable before its line
 *   const f = function () {}    not hoisted — ReferenceError before its line
 *
 *   (a, b = 1, ...rest)         only `undefined` triggers a default
 *   ({ a, b } = {})             destructured params need the trailing = {}
 *   fn.length                   params before the first default/rest
 *
 *   closure                     the private-state mechanism: memoize, once,
 *                               counters, the module pattern
 *   call / apply / bind         set `this` explicitly; bind is permanent
 *
 * Next: 07-arrow-functions.js
 */
