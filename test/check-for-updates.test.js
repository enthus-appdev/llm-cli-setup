import assert from 'node:assert/strict';
import { afterEach, describe, mock, test } from 'node:test';

import { checkForUpdates, offerUpdate, registerUpdatableTool } from '../lib/utils/versions.js';

// Runs in its own process (node --test isolates files), so the registry holds
// only the tools registered here.
const register = (id, check, installed = true) =>
  registerUpdatableTool({
    id,
    name: id,
    isInstalled: () => installed,
    check,
    update: async () => true,
  });

const captureOutput = async () => {
  const lines = [];
  mock.method(console, 'log', (...args) => lines.push(args.join(' ')));
  const results = await checkForUpdates();
  // eslint-disable-next-line no-control-regex
  return { results, text: lines.join('\n').replace(/\x1b\[[0-9;]*m/g, '') };
};

describe('checkForUpdates', () => {
  afterEach(() => mock.restoreAll());

  test('lists outdated tools and warns about failed lookups without throwing', async () => {
    register('old', async () => ({ installed: '1.0.0', latest: '1.1.0', outdated: true }));
    register('fresh', async () => ({ installed: '2.0.0', latest: '2.0.0', outdated: false }));
    register('offline', async () => {
      throw new Error('getaddrinfo ENOTFOUND github.com');
    });
    register('unmanaged', async () => null);
    register('missing', async () => assert.fail('absent tools are not checked'), false);

    const { results, text } = await captureOutput();

    assert.match(text, /Updates available:\n {2}old {10}1\.0\.0 → 1\.1\.0/);
    assert.doesNotMatch(text, /fresh .*→/);
    assert.doesNotMatch(text, /up to date/);
    assert.match(text, /Skipped update check for offline \(lookup failed/);
    assert.equal(results.old.state, 'outdated');
    assert.equal(results.fresh.state, 'current');
    assert.equal(results.offline.state, 'unknown');
    assert.equal(results.unmanaged.state, 'unknown');
    assert.equal(results.missing.state, 'absent');
  });

  test('offerUpdate reuses those results without checking or warning again', async () => {
    const lines = [];
    mock.method(console, 'log', (...args) => lines.push(args.join(' ')));
    assert.equal(await offerUpdate('offline'), 'unknown');
    assert.equal(await offerUpdate('missing'), 'absent');
    assert.deepEqual(lines, []);
  });
});
