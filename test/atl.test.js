import assert from 'node:assert/strict';
import test from 'node:test';

import { loginAtlTargets, unauthenticatedAtlTargets } from '../lib/installers/atl.js';

test('unauthenticatedAtlTargets skips hosts with valid tokens', () => {
  const targets = unauthenticatedAtlTargets(
    ['sandbox', 'prod', 'staging'],
    (hostname) => hostname !== 'sandbox'
  );

  assert.deepEqual(targets, ['sandbox']);
});

test('loginAtlTargets continues after a failed host and reports it', () => {
  const attempted = [];
  const failures = loginAtlTargets('atl', ['sandbox', 'prod'], {
    login: (_binary, args) => {
      const hostname = args.at(-1);
      attempted.push(hostname);
      if (hostname === 'sandbox') throw new Error('cancelled');
    },
    isAuthenticated: (hostname) => hostname === 'prod',
  });

  assert.deepEqual(attempted, ['sandbox', 'prod']);
  assert.deepEqual(failures, ['sandbox']);
});

test('loginAtlTargets verifies each successful login', () => {
  const checked = [];
  const failures = loginAtlTargets('atl', ['sandbox', 'prod'], {
    login: () => {},
    isAuthenticated: (hostname) => {
      checked.push(hostname);
      return hostname === 'sandbox';
    },
  });

  assert.deepEqual(checked, ['sandbox', 'prod']);
  assert.deepEqual(failures, ['prod']);
});

test('loginAtlTargets preserves the default-host login path', () => {
  const calls = [];
  const failures = loginAtlTargets('atl', [''], {
    login: (binary, args) => calls.push([binary, args]),
    isAuthenticated: () => true,
  });

  assert.deepEqual(calls, [['atl', ['auth', 'login']]]);
  assert.deepEqual(failures, []);
});
