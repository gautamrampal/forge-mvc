/**
 * CHAPTER 07 — ARROW FUNCTIONS
 *
 *   node practice/07-arrow-functions.js
 *
 * Arrows are not just shorter `function`. They differ in four concrete ways,
 * and every one of those differences will eventually decide whether your code
 * works. This chapter covers the syntax, then each difference, then the places
 * arrows are wrong.
 */

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 7.1  Every syntax form');
// ═══════════════════════════════════════════════════════════════════════════

// The long way, for comparison.
const addLong = function (a, b) {
  return a + b;
};
console.log(addLong(2, 3));                          // → 5

// One parameter, one expression. The expression IS the return value.
const double = (x) => x * 2;
console.log(double(5));                              // → 10

// Parens around a single parameter are optional. Pick one style and keep it.
const triple = x => x * 3;
console.log(triple(5));                              // → 15

// Two or more parameters ALWAYS need parens.
const add = (a, b) => a + b;
console.log(add(2, 3));                              // → 5

// Zero parameters need empty parens.
const answer = () => 42;
console.log(answer());                               // → 42

// A block body needs an explicit `return`. Forgetting it is the #1 typo.
const addVerbose = (a, b) => {
  const sum = a + b;
  return sum;
};
console.log(addVerbose(2, 3));                       // → 5

// No return statement in a block body means undefined.
const forgot = (a, b) => {
  a + b;
};
console.log(forgot(2, 3));                           // → undefined

// Rest parameters.
const collect = (...args) => args;
console.log(collect(1, 2, 3));                       // → [ 1, 2, 3 ]

// Default parameters.
const greet = (name = 'world') => `hello ${name}`;
console.log(greet());                                // → hello world
console.log(greet('Ann'));                           // → hello Ann

// Destructured parameters — extremely common in Express handlers.
const fullName = ({ first, last }) => `${first} ${last}`;
console.log(fullName({ first: 'Ada', last: 'L' }));  // → Ada L

// Async arrow.
const fetchIt = async (x) => x * 2;
console.log(fetchIt(1) instanceof Promise);          // → true

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 7.2  Returning an object literal — the parenthesis trap');
// ═══════════════════════════════════════════════════════════════════════════

// `{` after `=>` starts a BLOCK, not an object. So this returns undefined:
// `id:` is parsed as a label statement, and `x` as a useless expression.
const broken = (x) => { id: x };
console.log(broken(7));                              // → undefined

// Wrap the object in parens to force it to be read as a value.
const fixed = (x) => ({ id: x });
console.log(fixed(7));                               // → { id: 7 }

// This bites hardest inside .map, where the result is silently all-undefined.
console.log([1, 2].map((n) => { value: n }));        // → [ undefined, undefined ]
console.log([1, 2].map((n) => ({ value: n })));      // → [ { value: 1 }, { value: 2 } ]

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 7.3  DIFFERENCE 1 — `this` is inherited, not received');
// ═══════════════════════════════════════════════════════════════════════════

// A regular function gets `this` from HOW IT IS CALLED.
// An arrow has no `this` of its own; it uses whatever `this` was where it was
// WRITTEN. That single rule explains everything below.

const counter = {
  count: 10,
  asFunction: function () {
    return this.count;
  },
  asArrow: () => {
    // Written at module top level, so `this` is module.exports ({}), not counter.
    return this.count;
  },
};
console.log(counter.asFunction());                   // → 10
console.log(counter.asArrow());                      // → undefined

// So: DO NOT use an arrow for a method that needs `this`.

// But arrows are PERFECT for callbacks inside a method, because the callback
// inherits the method's `this`.
const cart = {
  prefix: '#',
  items: ['a', 'b'],

  withArrow() {
    // The arrow sees `this` === cart, because that is what `this` was here.
    return this.items.map((i) => this.prefix + i);
  },

  withFunction() {
    // A regular callback gets its own `this` (undefined/global), so this fails.
    return this.items.map(function (i) {
      return (this && this.prefix) + i;
    });
  },
};
console.log(cart.withArrow());                       // → [ '#a', '#b' ]
console.log(cart.withFunction());                    // → [ 'undefineda', 'undefinedb' ]

// The pre-arrow workaround you will still see in older code:
const cartOld = {
  prefix: '#',
  items: ['a'],
  run() {
    const self = this;                    // capture it manually
    return this.items.map(function (i) {
      return self.prefix + i;
    });
  },
};
console.log(cartOld.run());                          // → [ '#a' ]

// ...or map's second argument, which sets `this` for the callback:
const cartThisArg = {
  prefix: '#',
  items: ['a'],
  run() {
    return this.items.map(function (i) {
      return this.prefix + i;
    }, this);
  },
};
console.log(cartThisArg.run());                      // → [ '#a' ]

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 7.4  `this` survives being detached — that is the real win');
// ═══════════════════════════════════════════════════════════════════════════

class Timer {
  constructor() {
    this.ticks = 0;
    // A class FIELD holding an arrow: `this` is locked to the instance forever.
    this.tickArrow = () => ++this.ticks;
  }
  // A normal method: `this` depends on how it is called.
  tickMethod() {
    return ++this.ticks;
  }
}

const t = new Timer();

// Called normally, both work.
console.log(t.tickMethod());                         // → 1
console.log(t.tickArrow());                          // → 2

// Now pull them off the object — exactly what happens when you pass a method
// as a callback to setTimeout, an event listener, or .map.
const loose = t.tickMethod;
const looseArrow = t.tickArrow;

try {
  loose();
} catch (err) {
  console.log(err.constructor.name);                 // → TypeError
}
console.log(looseArrow());                           // → 3

// The three fixes for a detached regular method:
console.log(t.tickMethod.call(t));                   // → 4
console.log(t.tickMethod.bind(t)());                 // → 5
console.log((() => t.tickMethod())());               // → 6

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 7.5  DIFFERENCE 2 — no `arguments` object');
// ═══════════════════════════════════════════════════════════════════════════

function regularArgs() {
  return Array.from(arguments);
}
console.log(regularArgs(1, 2, 3));                   // → [ 1, 2, 3 ]

// An arrow has no `arguments` binding — use rest params instead. They are
// better anyway: a real array, and visible in the signature.
const arrowArgs = (...args) => args;
console.log(arrowArgs(1, 2, 3));                     // → [ 1, 2, 3 ]

// Inside a regular function, a nested arrow sees the OUTER `arguments`.
function outer() {
  const inner = () => arguments[0];
  return inner();
}
console.log(outer('from outer'));                    // → from outer

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 7.6  DIFFERENCE 3 — arrows cannot be constructors');
// ═══════════════════════════════════════════════════════════════════════════

const Person = (name) => {
  this.name = name;
};
try {
  new Person('Ann');
} catch (err) {
  console.log(err.constructor.name);                 // → TypeError
}

function PersonOk(name) {
  this.name = name;
}
console.log(new PersonOk('Ann').name);               // → Ann

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 7.7  DIFFERENCE 4 — no `prototype`, and no hoisting');
// ═══════════════════════════════════════════════════════════════════════════

console.log(typeof function () {}.prototype);        // → object
console.log(typeof (() => {}).prototype);            // → undefined

// Function DECLARATIONS are hoisted — callable before they appear.
console.log(hoisted());                              // → I am hoisted
function hoisted() {
  return 'I am hoisted';
}

// Arrows are assigned to a variable, so they follow const/let rules: the name
// exists but is in the "temporal dead zone" until the line runs.
try {
  notYet();
} catch (err) {
  console.log(err.constructor.name);                 // → ReferenceError
}
const notYet = () => 'too late';
console.log(notYet());                               // → too late

// Also: arrows cannot be generators. There is no `*() => {}` syntax.

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 7.8  Where arrows genuinely shine');
// ═══════════════════════════════════════════════════════════════════════════

const orders = [
  { id: 1, customer: 'ann', total: 120 },
  { id: 2, customer: 'bob', total: 40 },
  { id: 3, customer: 'ann', total: 80 },
];

// Array pipelines read like a sentence.
console.log(orders.filter((o) => o.total > 50).map((o) => o.id));   // → [ 1, 3 ]
console.log(orders.reduce((sum, o) => sum + o.total, 0));           // → 240
console.log(orders.map((o) => o.customer).filter((c, i, a) => a.indexOf(c) === i));
                                                                     // → [ 'ann', 'bob' ]

// Comparators.
console.log([10, 9, 100].sort((a, b) => a - b));     // → [ 9, 10, 100 ]

// Promise chains. Note we do NOT console.log inside the .then here: it would
// run after every other line in this file, since promise callbacks are queued
// as microtasks. Chapter 08 covers that ordering.
const chain = Promise.resolve(2).then((n) => n * 10);
console.log(chain instanceof Promise);               // → true

// A function that returns a function (currying / partial application).
const multiplyBy = (factor) => (n) => n * factor;
const times3 = multiplyBy(3);
console.log(times3(7));                              // → 21

// Middleware factories — the Forge `requireRole('admin')` pattern.
const requireRole = (role) => (req) => (req.role === role ? 'allowed' : 'denied');
console.log(requireRole('admin')({ role: 'admin' })); // → allowed
console.log(requireRole('admin')({ role: 'guest' })); // → denied

// One-line predicates keep intent at the call site.
const isActive = (u) => u.status === 'active';
console.log([{ status: 'active' }, { status: 'off' }].filter(isActive).length); // → 1

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 7.9  Where arrows are the WRONG choice');
// ═══════════════════════════════════════════════════════════════════════════

// 1. Object methods that use `this`  — see 7.3.
// 2. Prototype methods:
function Legacy() {}
Legacy.prototype.broken = () => (this ? 'has this' : 'no this');
Legacy.prototype.works = function () {
  return this instanceof Legacy;
};
console.log(new Legacy().works());                   // → true

// 3. Anything needing `new` — see 7.6.
// 4. Generators — no arrow syntax exists.
// 5. Deep recursion where a NAMED function aids the stack trace:
const fact = (n) => (n <= 1 ? 1 : n * fact(n - 1));
console.log(fact(5));                                // → 120
// (works, but a named `function fact()` shows up more clearly in stack traces)

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 7.10  Readability — shorter is not automatically better');
// ═══════════════════════════════════════════════════════════════════════════

// Clever but hard to read:
const dense = (a) => (b) => (c) => a + b + c;
console.log(dense(1)(2)(3));                         // → 6

// The same thing, obvious at a glance:
const sumThree = (a) => {
  return (b) => {
    return (c) => a + b + c;
  };
};
console.log(sumThree(1)(2)(3));                      // → 6

// Implicit return over multiple lines is fine when the shape carries meaning:
const toRow = (u) => ({
  id: u.id,
  label: `${u.name} <${u.email}>`,
});
console.log(toRow({ id: 1, name: 'Ann', email: 'a@b.c' }));
                                                     // → { id: 1, label: 'Ann <a@b.c>' }

/**
 * SUMMARY
 *
 *   x => x * 2              implicit return
 *   (a, b) => a + b         multiple params need parens
 *   x => ({ a: x })         object literal needs parens
 *   (...args) => args       no `arguments`; use rest
 *
 *   Arrows have NO own:  this, arguments, prototype, new, super
 *   Arrows CANNOT be:    constructors, generators, hoisted
 *
 *   Use an arrow for:    callbacks, array methods, promise chains,
 *                        factories, class fields that get passed around
 *   Use `function` for:  object methods, prototype methods, constructors,
 *                        generators, anything needing dynamic `this`
 *
 * Next: 08-promises.js
 */
