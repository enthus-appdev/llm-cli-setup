import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';

import { checkForUpdates, registerUpdatableTool } from '../lib/utils/versions.js';

const register = (id, check) =>
  registerUpdatableTool({ id, name: id, isInstalled: () => true, check, update: async () => true });

const output = async () => {
  const lines = [];
  mock.method(console, 'log', (...args) => lines.push(args.join(' ')));
  await checkForUpdates();
  mock.restoreAll();
  return lines.join('\n');
};

afterEach(() => mock.restoreAll());

// One process per file, and the registry only grows: the order of these tests matters.
test('reports up to date when every installed tool is verified current', async () => {
  register('fresh', async () => ({ installed: '2.0.0', latest: '2.0.0', outdated: false }));
  registerUpdatableTool({
    id: 'missing',
    name: 'missing',
    isInstalled: () => false,
    check: async () => null,
    update: async () => true,
  });
  assert.match(await output(), /Installed CLI tools are up to date/);
});

test('does not claim tools are up to date while an installed tool is unverified', async () => {
  register('unmanaged', async () => null);
  assert.doesNotMatch(await output(), /up to date/);
});
