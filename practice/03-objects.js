/**
 * CHAPTER 03 — OBJECTS
 *
 *   node practice/03-objects.js
 *
 * Objects are the shape of everything you pass around: request bodies, config,
 * DB rows, API responses. The two sections that matter most are 3.6 (copying
 * is shallow) and 3.9 (`this`).
 */

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 3.1  Reading properties');
// ═══════════════════════════════════════════════════════════════════════════

const user = { id: 1, name: 'Alice', 'has space': true };

console.log(user.name);                      // → Alice
console.log(user['name']);                   // → Alice
console.log(user['has space']);              // → true

// Bracket notation is also how you use a variable as the key.
const key = 'name';
console.log(user[key]);                      // → Alice

// A missing property is undefined, not an error...
console.log(user.missing);                   // → undefined

// ...but reading THROUGH a missing property throws.
try {
  console.log(user.missing.deep);
} catch (err) {
  console.log(err.constructor.name);         // → TypeError
}

// Optional chaining short-circuits to undefined instead of throwing.
console.log(user.missing?.deep);             // → undefined

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 3.2  Writing shorthand');
// ═══════════════════════════════════════════════════════════════════════════

const id = 7;
const status = 'active';
console.log({ id, status });                 // → { id: 7, status: 'active' }

// Computed keys: the expression in brackets becomes the key.
const field = 'role';
console.log({ [field]: 'admin' });           // → { role: 'admin' }
console.log({ [`user_${id}`]: true });       // → { user_7: true }

// Methods, getters and setters
const calc = {
  base: 10,
  add(n) {
    return this.base + n;
  },
  get double() {
    return this.base * 2;
  },
  set double(v) {
    this.base = v / 2;
  },
};
console.log(calc.add(5));                    // → 15
console.log(calc.double);                    // → 20
calc.double = 100;                           // invokes the setter
console.log(calc.base);                      // → 50

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 3.3  Adding, removing, checking');
// ═══════════════════════════════════════════════════════════════════════════

const o = { a: 1, b: 2 };
o.c = 3;
console.log(o);                              // → { a: 1, b: 2, c: 3 }

delete o.a;
console.log(o);                              // → { b: 2, c: 3 }

// `in` also sees INHERITED properties, which is rarely what you want.
console.log('b' in o);                       // → true
console.log('toString' in o);                // → true
console.log(Object.hasOwn(o, 'toString'));   // → false
console.log(Object.hasOwn(o, 'b'));          // → true

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 3.4  A key set to undefined still EXISTS');
// ═══════════════════════════════════════════════════════════════════════════

const withUndef = { a: undefined };
console.log(withUndef.a);                    // → undefined
console.log('a' in withUndef);               // → true
console.log(Object.keys(withUndef));         // → [ 'a' ]

// ...but JSON drops it entirely, so a round-trip is not identity-preserving.
console.log(JSON.stringify(withUndef));      // → {}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 3.5  Iterating');
// ═══════════════════════════════════════════════════════════════════════════

const scores = { alice: 90, bob: 75, carol: 82 };

console.log(Object.keys(scores));            // → [ 'alice', 'bob', 'carol' ]
console.log(Object.values(scores));          // → [ 90, 75, 82 ]
console.log(Object.entries(scores));         // → [ [ 'alice', 90 ], [ 'bob', 75 ], [ 'carol', 82 ] ]

// entries + fromEntries is the object equivalent of map/filter.
console.log(Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, v + 5])));
                                             // → { alice: 95, bob: 80, carol: 87 }
console.log(Object.fromEntries(Object.entries(scores).filter(([, v]) => v >= 82)));
                                             // → { alice: 90, carol: 82 }
console.log(Object.fromEntries(Object.entries(scores).sort((a, b) => b[1] - a[1])));
                                             // → { alice: 90, carol: 82, bob: 75 }

// Renaming keys — snake_case to camelCase, a daily chore with SQL rows.
console.log(
  Object.fromEntries(
    Object.entries({ first_name: 'A', last_name: 'B' }).map(([k, v]) => [
      k.replace(/_(\w)/g, (_, c) => c.toUpperCase()),
      v,
    ])
  )
);                                           // → { firstName: 'A', lastName: 'B' }

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 3.6  Copying is SHALLOW — the one to remember');
// ═══════════════════════════════════════════════════════════════════════════

const original = { name: 'A', meta: { seen: 1 } };
const copy = { ...original };

copy.name = 'B';                             // top level: independent
copy.meta.seen = 999;                        // one level down: SHARED

console.log(original.name);                  // → A
console.log(original.meta.seen);             // → 999

// Merging. Later sources win, which is what makes the defaults pattern work.
console.log({ ...{ a: 1, b: 1 }, ...{ b: 2, c: 3 } });    // → { a: 1, b: 2, c: 3 }
console.log({ ...{ page: 1, size: 25 }, ...{ size: 50 } }); // → { page: 1, size: 50 }
console.log(Object.assign({}, { a: 1 }));    // → { a: 1 }

// For a real deep copy use structuredClone. It keeps Dates, Maps and Sets,
// and handles cycles — JSON round-tripping destroys all of those.
const src = { meta: { seen: 1 } };
const deep = structuredClone(src);
deep.meta.seen = 0;
console.log(src.meta.seen);                  // → 1

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 3.7  Destructuring');
// ═══════════════════════════════════════════════════════════════════════════

const req = { body: { username: 'bob', password: 'x' }, params: { id: '5' } };

const { body, params } = req;
console.log(body);                           // → { username: 'bob', password: 'x' }
console.log(params);                         // → { id: '5' }

// Nested
const { body: { username } } = req;
console.log(username);                       // → bob

// Default when the key is missing
const { missing = 'fallback' } = req;
console.log(missing);                        // → fallback

// Rename with a colon
const { body: payload } = req;
console.log(payload.username);               // → bob

// Rest — the idiomatic way to OMIT a key
const { body: _drop, ...others } = req;
console.log(Object.keys(others));            // → [ 'params' ]

// In a function signature. The `= {}` at the end is what lets you call it
// with no arguments at all.
function paginate({ page = 1, pageSize = 25, ...rest } = {}) {
  return { page, pageSize, rest };
}
console.log(paginate());                     // → { page: 1, pageSize: 25, rest: {} }
console.log(paginate({ page: 3 }));          // → { page: 3, pageSize: 25, rest: {} }
console.log(paginate({ page: 2, q: 'a' }));  // → { page: 2, pageSize: 25, rest: { q: 'a' } }

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 3.8  ?. and ?? — the two that remove the most boilerplate');
// ═══════════════════════════════════════════════════════════════════════════

const cfg = { db: { host: 'localhost', port: 0 }, list: null };

console.log(cfg.db?.host);                   // → localhost
console.log(cfg.cache?.host);                // → undefined
console.log(cfg.list?.[0]);                  // → undefined
console.log(cfg.fn?.());                     // → undefined

// || falls back on ANY falsy value, so a legitimate 0 or "" is swallowed.
// ?? falls back only on null/undefined. This distinction is a real bug source.
console.log(cfg.db.port || 3306);            // → 3306
console.log(cfg.db.port ?? 3306);            // → 0
console.log('' || 'dflt');                   // → dflt
// (stringified so the empty-string result is visible rather than a blank line)
console.log(JSON.stringify('' ?? 'dflt'));   // → ""

// Logical assignment
const la = { a: null, b: 0, c: 5 };
la.a ??= 'set';                              // assigns: a was null
la.b ??= 'not set';                          // skips:   b is 0, not nullish
la.c ||= 99;                                 // skips:   c is truthy
console.log(la);                             // → { a: 'set', b: 0, c: 5 }

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 3.9  `this` in an object');
// ═══════════════════════════════════════════════════════════════════════════

const counter = {
  n: 0,
  inc: function () {
    this.n++;
    return this.n;
  },
};
console.log(counter.inc());                  // → 1

// `this` is decided by HOW a function is called, not where it is defined.
// Pull the method off the object and the binding is gone.
const detached = counter.inc;

// This file is CommonJS, which is non-strict, so `this` falls back to the
// global object: `this.n` is undefined and undefined++ gives NaN. It fails
// SILENTLY. In an ES module or a class body (both strict) it throws instead.
console.log(detached());                     // → NaN

// The same code under strict mode:
try {
  (function () {
    'use strict';
    const f = function () {
      return this.n;
    };
    f();
  })();
} catch (err) {
  console.log(err.constructor.name);         // → TypeError
}

// Three ways to restore the binding:
console.log(detached.call(counter));         // → 2
console.log(detached.bind(counter)());       // → 3
console.log((() => counter.inc())());        // → 4

// (Arrow functions get a whole chapter — see 07-arrow-functions.js.)

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 3.10  Prototypes — what classes are built on');
// ═══════════════════════════════════════════════════════════════════════════

const proto = {
  greet() {
    return 'hi ' + this.name;
  },
};

const child = Object.create(proto);
child.name = 'Ann';

console.log(child.greet());                  // → hi Ann
console.log(Object.keys(child));             // → [ 'name' ]
console.log(Object.getPrototypeOf(child) === proto);   // → true

// An object with NO prototype — no inherited keys at all. Useful as a lookup
// map when keys come from user input and might collide with 'constructor'.
const bare = Object.create(null);
bare.a = 1;
console.log(Object.keys(bare));              // → [ 'a' ]
console.log('toString' in bare);             // → false

/**
 * SUMMARY
 *
 *   obj?.a?.b            safe read through a possibly-missing path
 *   x ?? d               default ONLY on null/undefined  (|| eats 0 and "")
 *   Object.hasOwn(o, k)  own-property check;  `in` also sees inherited
 *   Object.entries       + fromEntries = map/filter for objects
 *   { ...obj }           SHALLOW — nested objects stay shared
 *   structuredClone      real deep copy, keeps Date/Map/Set
 *   { a, ...rest }       the idiomatic way to omit a key
 *   this                 set by the CALL, lost when a method is detached
 *
 * Next: 04-map-set.js
 */
