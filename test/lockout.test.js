// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_LOGIN_ATTEMPTS, LOCKED_MESSAGE, isWrongPassword, shouldLock, wrongPasswordMessage, attemptsLeft } from '../src/lib/lockout.js';

test('5 wrong passwords lock the account', () => {
  assert.equal(MAX_LOGIN_ATTEMPTS, 5);
  assert.equal(shouldLock(4), false);
  assert.equal(shouldLock(5), true);
  assert.equal(wrongPasswordMessage(5), LOCKED_MESSAGE);
});

test('the user is told how many tries are left', () => {
  assert.equal(attemptsLeft(3), 2);
  assert.match(wrongPasswordMessage(3), /2 tries left/);
  assert.match(wrongPasswordMessage(4), /1 try left/);
});

test('locked message says only an admin can unlock it', () => {
  assert.match(LOCKED_MESSAGE, /locked/i);
  assert.match(LOCKED_MESSAGE, /admin/i);
});

test('only a wrong email/password counts as a failed try', () => {
  assert.equal(isWrongPassword({ code: 'invalid_credentials', message: 'Invalid login credentials' }), true);
  assert.equal(isWrongPassword({ message: 'Invalid login credentials' }), true);
  assert.equal(isWrongPassword({ code: 'email_not_confirmed', message: 'Email not confirmed' }), false);
  assert.equal(isWrongPassword(null), false);
});
