// Login lockout rules (pure functions — unit tested in test/lockout.test.js).
// After MAX_LOGIN_ATTEMPTS wrong passwords in a row the account is locked.
// Only an admin can unlock it (Admin → Users → Unlock).
export const MAX_LOGIN_ATTEMPTS = 5;

export const LOCKED_MESSAGE =
  `Your account is locked after ${MAX_LOGIN_ATTEMPTS} wrong password attempts. ` +
  'Please contact the pharmacy admin to unlock it.';

// Only a wrong email/password counts as a failed try (not "email not confirmed", network errors, etc.).
export function isWrongPassword(error) {
  if (!error) return false;
  return error.code === 'invalid_credentials' || /invalid login credentials/i.test(error.message || '');
}

export function attemptsLeft(failedCount, max = MAX_LOGIN_ATTEMPTS) {
  const used = Number.isInteger(failedCount) && failedCount > 0 ? failedCount : 0;
  return Math.max(0, max - used);
}

export function shouldLock(failedCount, max = MAX_LOGIN_ATTEMPTS) {
  return Number.isInteger(failedCount) && failedCount >= max;
}

// Message shown after a wrong password. failedCount is null when the lockout table is not set up yet.
export function wrongPasswordMessage(failedCount, max = MAX_LOGIN_ATTEMPTS) {
  if (failedCount == null) return 'Incorrect email or password.';
  if (shouldLock(failedCount, max)) return LOCKED_MESSAGE;
  const left = attemptsLeft(failedCount, max);
  return `Incorrect email or password. ${left} ${left === 1 ? 'try' : 'tries'} left before your account is locked.`;
}
