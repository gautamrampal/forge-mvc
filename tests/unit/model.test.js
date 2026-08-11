require('../helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');
const { migrateTestDb, resetTestDb, closeTestDb } = require('../helpers/db');
const { createUser, DEFAULT_PASSWORD } = require('../helpers/factories');
const { verifyPassword } = require('../../core/helpers/hash');

const User = require('../../app/models/User');

test.before(async () => { await migrateTestDb(); });
test.beforeEach(async () => { await resetTestDb(); });
test.after(async () => { await closeTestDb(); });

// --- Inherited CRUD from core/Model.js ------------------------------------------------------

test('create returns the row with an id', async () => {
  const user = await createUser({ username: 'ada' });
  assert.ok(user.id);
  assert.equal(user.username, 'ada');
});

test('findById returns the row, or null when missing', async () => {
  const user = await createUser();
  assert.equal((await User.findById(user.id)).username, user.username);
  assert.equal(await User.findById(999999), null);
});

test('find filters, orders and limits', async () => {
  await createUser({ status: 'active' });
  await createUser({ status: 'inactive' });
  await createUser({ status: 'inactive' });

  assert.equal((await User.find({ status: 'inactive' })).length, 2);

  const asc = await User.find({}, { limit: 2, orderBy: 'id ASC' });
  assert.equal(asc.length, 2);
  assert.ok(asc[0].id < asc[1].id, 'orderBy ASC must be honoured');
});

test('count respects the filter', async () => {
  await createUser({ status: 'active' });
  await createUser({ status: 'inactive' });
  assert.equal(await User.count(), 2);
  assert.equal(await User.count({ status: 'active' }), 1);
});

test('paginate reports correct, non-overlapping pages', async () => {
  for (let i = 0; i < 7; i++) await createUser();

  const p1 = await User.paginate({ page: 1, pageSize: 3, orderBy: 'id ASC' });
  assert.equal(p1.rows.length, 3);
  assert.equal(p1.total, 7);
  assert.equal(p1.totalPages, 3);

  const p3 = await User.paginate({ page: 3, pageSize: 3, orderBy: 'id ASC' });
  assert.equal(p3.rows.length, 1, 'last page holds the remainder');

  const ids1 = p1.rows.map((r) => String(r.id));
  const ids3 = p3.rows.map((r) => String(r.id));
  assert.equal(ids1.some((id) => ids3.includes(id)), false, 'pages must not overlap');
});

test('paginate on an empty table reports one page, not zero', async () => {
  const result = await User.paginate({ page: 1, pageSize: 25 });
  assert.deepEqual(result.rows, []);
  assert.equal(result.totalPages, 1, 'an empty list is still "page 1 of 1" for the UI');
});

// --- User-specific behaviour ----------------------------------------------------------------

test('createWithPassword stores a bcrypt hash, never the plaintext', async () => {
  const user = await User.createWithPassword({ username: 'hashed', password: 'Plaintext@123' });
  const stored = await User.findById(user.id);

  assert.notEqual(stored.password, 'Plaintext@123', 'plaintext must never reach the database');
  assert.match(stored.password, /^\$2[aby]\$/, 'must look like a bcrypt hash');
  assert.equal(await verifyPassword('Plaintext@123', stored.password), true);
});

test('findByUsername locates the account', async () => {
  await createUser({ username: 'findme' });
  assert.equal((await User.findByUsername('findme')).username, 'findme');
  assert.equal(await User.findByUsername('nobody'), null);
});

test('updateProfile leaves the password alone when none is supplied', async () => {
  const user = await createUser({ username: 'keeper' });
  const before = (await User.findById(user.id)).password;

  await User.updateProfile(user.id, { username: 'renamed', status: 'inactive' });
  const after = await User.findById(user.id);

  assert.equal(after.username, 'renamed');
  assert.equal(after.status, 'inactive');
  assert.equal(after.password, before, 'a blank password field must not wipe the password');
});

test('updateProfile re-hashes when a new password is supplied', async () => {
  const user = await createUser();
  const before = (await User.findById(user.id)).password;

  await User.updateProfile(user.id, { username: user.username, status: 'active', password: 'Brand@New123' });
  const after = await User.findById(user.id);

  assert.notEqual(after.password, before);
  assert.equal(await verifyPassword('Brand@New123', after.password), true);
});

test('usernameTaken ignores the row being edited', async () => {
  const a = await createUser({ username: 'taken' });
  const b = await createUser({ username: 'other' });

  assert.equal(await User.usernameTaken('taken'), true);
  assert.equal(await User.usernameTaken('free'), false);
  // Saving a user without changing their username must not trip the check.
  assert.equal(await User.usernameTaken('taken', a.id), false);
  assert.equal(await User.usernameTaken('taken', b.id), true);
});

test('countActive counts only active accounts', async () => {
  await createUser({ status: 'active' });
  await createUser({ status: 'active' });
  await createUser({ status: 'inactive' });
  assert.equal(await User.countActive(), 2);
});

test('publicFields strips the password hash', async () => {
  const user = await createUser();
  const safe = User.publicFields(await User.findById(user.id));

  assert.equal('password' in safe, false, 'the hash must never leave the model layer');
  assert.equal(safe.username, user.username);
  assert.equal(User.publicFields(null), null);
});

// --- Search -----------------------------------------------------------------------------------

test('search matches a partial, case-insensitive substring', async () => {
  await createUser({ username: 'jane.doe' });
  await createUser({ username: 'JANE.SMITH' });
  await createUser({ username: 'bob.jones' });

  const mid = await User.find({}, { search: { fields: ['username'], term: 'ane' } });
  assert.equal(mid.length, 2, 'must match in the middle of a value, not just the start');

  const upper = await User.find({}, { search: { fields: ['username'], term: 'JANE' } });
  assert.equal(upper.length, 2, 'must be case-insensitive');
});

test('search combines with the where filter using AND, not OR', async () => {
  await createUser({ username: 'jane.active', status: 'active' });
  await createUser({ username: 'jane.inactive', status: 'inactive' });
  await createUser({ username: 'bob.inactive', status: 'inactive' });

  const rows = await User.find({ status: 'inactive' }, { search: { fields: ['username'], term: 'jane' } });
  assert.equal(rows.length, 1, 'search must narrow within the filter');
  assert.equal(rows[0].username, 'jane.inactive');
});

test('count applies the same search as find, so pagination totals are honest', async () => {
  for (const username of ['match.one', 'match.two', 'other.user']) await createUser({ username });

  const search = { fields: ['username'], term: 'match' };
  assert.equal(await User.count({}, { search }), 2);

  // The bug this guards: if paginate() counted without the search, it would report 3 rows /
  // 1 page while only returning 2 — or worse, offer pages that come back empty.
  const result = await User.paginate({ search, pageSize: 1 });
  assert.equal(result.total, 2);
  assert.equal(result.totalPages, 2);
  assert.equal(result.rows.length, 1);
});

test('a wildcard in the search term is escaped, not interpreted', async () => {
  await createUser({ username: 'alice' });
  await createUser({ username: 'bob' });
  await createUser({ username: 'a%b' });

  // Unescaped, "%" is a LIKE wildcard and "%%%" would match every row.
  const pct = await User.find({}, { search: { fields: ['username'], term: '%' } });
  assert.equal(pct.length, 1, 'a literal % must match only the row containing one');
  assert.equal(pct[0].username, 'a%b');

  // "_" matches any single character in LIKE, so "a_b" would otherwise match "a%b" AND "axb".
  await createUser({ username: 'axb' });
  const underscore = await User.find({}, { search: { fields: ['username'], term: 'a_b' } });
  assert.equal(underscore.length, 0, 'a literal _ must not act as a single-char wildcard');
});

test('an empty or whitespace-only search term is ignored', async () => {
  await createUser();
  await createUser();

  // searchFor() returns null for these, so paginate falls back to an unfiltered list rather
  // than searching for "" and matching everything by accident.
  assert.equal(User.searchFor(''), null);
  assert.equal(User.searchFor('   '), null);
  assert.equal(User.searchFor(undefined), null);
  assert.equal(User.searchFor(null), null);

  assert.equal((await User.paginate({ search: User.searchFor('  ') })).total, 2);
});

test('searchFor trims the term and uses the model-declared fields', () => {
  assert.deepEqual(User.searchFor('  jane  '), { fields: ['username'], term: 'jane' });
  assert.equal(User.searchable.includes('password'), false, 'never search the password column');
});

test('a model without a table set fails loudly', () => {
  const Model = require('../../core/Model');
  class Broken extends Model {}
  assert.throws(() => Broken.resource, /must set a static `table`/);
});
