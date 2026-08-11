/**
 * CHAPTER 10 — CLASSES
 *
 *   node practice/10-classes.js
 *
 * Closest thing to familiar ground if you are coming from PHP. The two things
 * that genuinely differ: `#private` is enforced by the language (not a
 * convention), and class bodies are ALWAYS strict mode, which changes how
 * `this` fails.
 */

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 10.1  The shape of a class');
// ═══════════════════════════════════════════════════════════════════════════

class User {
  static table = 'users';     // belongs to the CLASS, not to instances
  #password;                  // truly private — the # is part of the name
  role = 'member';            // instance field with a default

  constructor(name, password) {
    this.name = name;         // public property
    this.#password = password;
  }

  greet() {
    return `Hi ${this.name}`;
  }

  // A getter is read like a property — no parentheses at the call site.
  get display() {
    return `${this.name} (${this.role})`;
  }

  set display(value) {
    this.name = value.split(' ')[0];
  }

  // A static method is called on the class. Handy for factories.
  static fromRow(row) {
    return new User(row.name, row.pw);
  }

  checkPassword(candidate) {
    return this.#password === candidate;
  }
}

const u = new User('Ann', 's3cret');

console.log(u.name);                             // → Ann
console.log(u.greet());                          // → Hi Ann
console.log(u.display);                          // → Ann (member)
console.log(User.table);                         // → users
console.log(User.fromRow({ name: 'Bob', pw: 'x' }).name);   // → Bob
console.log(u instanceof User);                  // → true
console.log(u.constructor.name);                 // → User

// The setter fires on assignment.
u.display = 'Annie Smith';
console.log(u.name);                             // → Annie

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 10.2  #private is enforced, not conventional');
// ═══════════════════════════════════════════════════════════════════════════

console.log(u.checkPassword('s3cret'));          // → true

// There is no public `password` at all — not even a renamed one.
console.log(u.password);                         // → undefined
console.log(Object.keys(u));                     // → [ 'role', 'name' ]
console.log(JSON.stringify(u));                  // → {"role":"member","name":"Annie"}

// Touching it from outside is a SYNTAX error, caught before the code runs.
try {
  eval('u.#password');
} catch (err) {
  console.log(err.constructor.name);             // → SyntaxError
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 10.3  Inheritance');
// ═══════════════════════════════════════════════════════════════════════════

class Admin extends User {
  constructor(name, password, level) {
    super(name, password);    // MUST come before any use of `this`
    this.role = 'admin';
    this.level = level;
  }

  greet() {
    return super.greet() + ' [admin]';   // call the parent implementation
  }

  can(action) {
    return this.level > 1 || action === 'read';
  }
}

const a = new Admin('Root', 'x', 2);

console.log(a.greet());                          // → Hi Root [admin]
console.log(a.display);                          // → Root (admin)
console.log(a.can('write'));                     // → true
console.log(a instanceof Admin);                 // → true
console.log(a instanceof User);                  // → true
console.log(Admin.table);                        // → users

// Using `this` before super() is a hard error, not a warning.
try {
  class Bad extends User {
    constructor() {
      this.x = 1;
      super('a', 'b');
    }
  }
  new Bad();
} catch (err) {
  console.log(err.constructor.name);             // → ReferenceError
}

// A subclass can shadow a static without touching the parent's.
class Post extends User {
  static table = 'posts';
}
console.log(Post.table);                         // → posts
console.log(User.table);                         // → users

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 10.4  Classes are functions and prototypes underneath');
// ═══════════════════════════════════════════════════════════════════════════

console.log(typeof User);                        // → function

// Methods live once on the prototype; only FIELDS are copied per instance.
console.log(Object.getOwnPropertyNames(User.prototype));
                                                 // → [ 'constructor', 'greet', 'display', 'checkPassword' ]
console.log(Object.keys(u));                     // → [ 'role', 'name' ]
console.log(u.greet === User.prototype.greet);   // → true
console.log(Object.getPrototypeOf(Admin.prototype) === User.prototype);   // → true

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 10.5  Class bodies are always strict mode');
// ═══════════════════════════════════════════════════════════════════════════

class Handler {
  constructor() {
    this.count = 0;
    this.handleBound = this.handle.bind(this);   // classic fix
    this.handleArrow = () => ++this.count;       // arrow field — also fixed
  }
  handle() {
    return ++this.count;
  }
}

const h = new Handler();
console.log(h.handle());                         // → 1

// Detach the method and `this` is undefined. In a plain (non-strict) function
// this would silently give NaN; in a class it throws, which is better.
try {
  const loose = h.handle;
  loose();
} catch (err) {
  console.log(err.constructor.name);             // → TypeError
}

// Both pre-bound forms survive being passed around.
console.log(h.handleBound());                    // → 2
console.log(h.handleArrow());                    // → 3

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 10.6  Static blocks and static private');
// ═══════════════════════════════════════════════════════════════════════════

class Config {
  static #secret = 'hidden';
  static defaults;

  // Runs once, when the class is defined. Good for computed statics.
  static {
    Config.defaults = { retries: 3 };
  }

  static reveal() {
    return Config.#secret;
  }
}

console.log(Config.defaults);                    // → { retries: 3 }
console.log(Config.reveal());                    // → hidden

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 10.7  There is no `abstract` keyword — emulate it');
// ═══════════════════════════════════════════════════════════════════════════

class Repository {
  constructor() {
    // new.target is the class actually being constructed.
    if (new.target === Repository) throw new Error('Repository is abstract');
  }
  find() {
    throw new Error(`${this.constructor.name} must implement find()`);
  }
}

class UserRepo extends Repository {
  find() {
    return 'row';
  }
}
class BadRepo extends Repository {}

try {
  new Repository();
} catch (err) {
  console.log(err.message);                      // → Repository is abstract
}
console.log(new UserRepo().find());              // → row
try {
  new BadRepo().find();
} catch (err) {
  console.log(err.message);                      // → BadRepo must implement find()
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 10.8  Composition beats deep inheritance');
// ═══════════════════════════════════════════════════════════════════════════

// A mixin is just a function returning a subclass. Stack them instead of
// building a five-level hierarchy.
const Timestamped = (Base) =>
  class extends Base {
    touch() {
      this.updatedAt = 'now';
      return this;
    }
  };

const SoftDelete = (Base) =>
  class extends Base {
    remove() {
      this.deletedAt = 'now';
      return this;
    }
  };

class Article extends SoftDelete(Timestamped(Object)) {}
console.log(Object.keys(new Article().touch().remove()));
                                                 // → [ 'updatedAt', 'deletedAt' ]

// Across module boundaries instanceof can fail (two copies of a package), so
// duck typing is often the more robust check.
console.log(typeof a.greet === 'function');      // → true

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 10.9  Controlling how an instance serialises');
// ═══════════════════════════════════════════════════════════════════════════

class Money {
  constructor(cents) {
    this.cents = cents;
  }
  toJSON() {
    return { amount: (this.cents / 100).toFixed(2), currency: 'INR' };
  }
  toString() {
    return `₹${(this.cents / 100).toFixed(2)}`;
  }
}

const price = new Money(19999);
console.log(JSON.stringify(price));              // → {"amount":"199.99","currency":"INR"}
console.log(`${price}`);                         // → ₹199.99

// toJSON is how you keep secrets out of an API response — it is called
// automatically by JSON.stringify, including for nested values.
class Session {
  constructor(id, secret) {
    this.id = id;
    this.secret = secret;
  }
  toJSON() {
    return { id: this.id };
  }
}
console.log(JSON.stringify({ session: new Session(1, 'shhh') }));
                                                 // → {"session":{"id":1}}

// Symbol.toPrimitive gives full control over numeric vs string coercion.
class Temp {
  constructor(deg) {
    this.deg = deg;
  }
  [Symbol.toPrimitive](hint) {
    return hint === 'number' ? this.deg : `${this.deg}°C`;
  }
}
const t = new Temp(30);
console.log(+t);                                 // → 30
console.log(`${t}`);                             // → 30°C

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n## 10.10  Making a class iterable');
// ═══════════════════════════════════════════════════════════════════════════

class Playlist {
  constructor(...songs) {
    this.songs = songs;
  }
  // A generator method is the shortest way to satisfy the protocol.
  *[Symbol.iterator]() {
    yield* this.songs;
  }
  get length() {
    return this.songs.length;
  }
}

const pl = new Playlist('a', 'b', 'c');
console.log([...pl]);                            // → [ 'a', 'b', 'c' ]
console.log(pl.length);                          // → 3

const forOf = [];
for (const song of pl) forOf.push(song);
console.log(forOf);                              // → [ 'a', 'b', 'c' ]

/**
 * SUMMARY
 *
 *   static x        on the class;  #x  private;  x = 1  instance field
 *   get / set       accessed as properties, no parentheses
 *   super()         must run before `this` in a derived constructor
 *   new.target      lets you fake an abstract base class
 *   static { }      runs once at class-definition time
 *
 *   class bodies are strict: a detached method THROWS rather than
 *   silently producing NaN — bind it, or use an arrow class field
 *
 *   toJSON()        controls JSON.stringify output; use it to hide secrets
 *   *[Symbol.iterator]()  makes the class work with for...of and spread
 *
 * Next: 11-errors.js
 */
