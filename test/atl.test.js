import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  loginAtlTargets,
  parseAtlAuthStatus,
  unauthenticatedAtlTargets,
} from '../lib/installers/atl.js';

describe('ATL authentication helpers', () => {
  test('parseAtlAuthStatus requires the scoped host to be authenticated', () => {
    assert.equal(parseAtlAuthStatus('[{"authenticated":true}]', 'sandbox'), true);
    assert.equal(parseAtlAuthStatus('[{"authenticated":false}]', 'sandbox'), false);
    assert.equal(parseAtlAuthStatus('[]', 'sandbox'), false);
    assert.equal(parseAtlAuthStatus('{"authenticated":true}', 'sandbox'), false);
  });

  test('parseAtlAuthStatus accepts any authenticated host for the legacy bare call', () => {
    const output = '[{"authenticated":false},{"authenticated":true}]';
    assert.equal(parseAtlAuthStatus(output), true);
  });

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
});
