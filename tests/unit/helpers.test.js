require('../helpers/env');
const test = require('node:test');
const assert = require('node:assert/strict');

const { hashPassword, verifyPassword } = require('../../core/helpers/hash');
const { signToken, verifyToken } = require('../../core/helpers/jwt');
const { parsePagination } = require('../../core/helpers/pagination');

test('hash: verifies a correct password and rejects a wrong one', async () => {
  const hash = await hashPassword('correct horse battery staple');
  assert.notEqual(hash, 'correct horse battery staple', 'must not store plaintext');
  assert.equal(await verifyPassword('correct horse battery staple', hash), true);
  assert.equal(await verifyPassword('wrong password', hash), false);
});

test('hash: verifying against a null/undefined hash returns false, never throws', async () => {
  // Guards the "user not found" path — controllers call verifyPassword(input, user?.password_hash)
  // and must get a clean false rather than a crash that leaks which emails exist.
  assert.equal(await verifyPassword('anything', null), false);
  assert.equal(await verifyPassword('anything', undefined), false);
});

test('hash: same password produces different hashes (salted)', async () => {
  const a = await hashPassword('same-password');
  const b = await hashPassword('same-password');
  assert.notEqual(a, b, 'bcrypt must salt each hash');
});

test('jwt: round-trips a payload', () => {
  const token = signToken({ id: 7, email: 'a@b.c', role: 'admin' });
  const decoded = verifyToken(token);
  assert.equal(decoded.id, 7);
  assert.equal(decoded.email, 'a@b.c');
  assert.equal(decoded.role, 'admin');
});

test('jwt: rejects a tampered token', () => {
  const token = signToken({ id: 1, role: 'member' });
  // Flip a character in the signature segment.
  const [header, payload, sig] = token.split('.');
  const tampered = `${header}.${payload}.${sig.slice(0, -1)}${sig.slice(-1) === 'A' ? 'B' : 'A'}`;
  assert.throws(() => verifyToken(tampered));
});

test('jwt: rejects an expired token', () => {
  const token = signToken({ id: 1 }, { expiresIn: '-1s' });
  assert.throws(() => verifyToken(token), /expired/i);
});

test('pagination: applies defaults', () => {
  assert.deepEqual(parsePagination({}), { page: 1, pageSize: 25 });
});

test('pagination: clamps out-of-range and non-numeric input', () => {
  assert.equal(parsePagination({ page: '0' }).page, 1, 'page floors at 1');
  assert.equal(parsePagination({ page: '-5' }).page, 1);
  assert.equal(parsePagination({ page: 'abc' }).page, 1);
  assert.equal(parsePagination({ page_size: '9999' }).pageSize, 100, 'pageSize caps at maxPageSize');
  assert.equal(parsePagination({ page_size: '0' }).pageSize, 1);
});

test('pagination: honours explicit bounds', () => {
  const result = parsePagination({ page_size: '500' }, { defaultPageSize: 10, maxPageSize: 50 });
  assert.equal(result.pageSize, 50);
  assert.equal(parsePagination({}, { defaultPageSize: 10 }).pageSize, 10);
});
