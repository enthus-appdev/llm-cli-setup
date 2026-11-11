import assert from 'node:assert/strict';
import { afterEach, describe, mock, test } from 'node:test';
import inquirer from 'inquirer';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  brewPackageInfo,
  compareSemver,
  displayGoVersion,
  extractVersion,
  isGoBuildOutdated,
  offerUpdate,
  parseGoBuildInfo,
  pickGoLatest,
  pseudoVersionHash,
  registerUpdatableTool,
  releaseCheckResult,
} from '../lib/utils/versions.js';

describe('compareSemver', () => {
  test('orders core versions numerically', () => {
    assert.equal(compareSemver('v1.13.0', 'v1.15.0'), -1);
    assert.equal(compareSemver('2.103.3', '2.97.0'), 1);
    assert.equal(compareSemver('v1.1.3', '1.1.3'), 0);
  });

  test('a release sorts above its prereleases', () => {
    assert.equal(compareSemver('v1.5.0-rc.1', 'v1.5.0'), -1);
    assert.equal(compareSemver('v1.5.0-rc.2', 'v1.5.0-rc.10'), -1);
  });

  test('a pseudo-version built after a tag sorts above that tag', () => {
    assert.equal(compareSemver('v1.5.1-0.20260716050216-9f8ddaa00933', 'v1.5.0'), 1);
  });

  test('an untagged pseudo-version sorts below any release', () => {
    assert.equal(compareSemver('v0.0.0-20251222112700-718627d35076', 'v1.5.0'), -1);
  });

  test('returns null for non-semver input', () => {
    assert.equal(compareSemver('(devel)', 'v1.0.0'), null);
    assert.equal(compareSemver(null, 'v1.0.0'), null);
  });
});

describe('extractVersion', () => {
  test('finds the version in typical --version output', () => {
    assert.equal(extractVersion('gh version 2.97.0 (2026-07-31)'), '2.97.0');
    assert.equal(extractVersion('gcx version 1.3.1 built from Homebrew on 2026-09-22'), '1.3.1');
    assert.equal(extractVersion('hcloud v1.70.2'), '1.70.2');
    assert.equal(extractVersion('no version here'), null);
  });
});

describe('Go build info', () => {
  const buildInfo = (version) =>
    `/Users/x/go/bin/atl: go1.25.0\n\tpath\tgithub.com/o/atl-cli/cmd/atl\n\tmod\tgithub.com/o/atl-cli\t${version}\th1:abc=\n\tdep\tgithub.com/x/y\tv1.0.0\n`;

  test('reads the main module version', () => {
    assert.equal(parseGoBuildInfo(buildInfo('v1.13.0')), 'v1.13.0');
  });

  test('treats local (devel) builds and missing output as unknown', () => {
    assert.equal(parseGoBuildInfo(buildInfo('(devel)')), null);
    assert.equal(parseGoBuildInfo(''), null);
  });

  test('shortens pseudo-versions for display and keeps tags', () => {
    assert.equal(
      displayGoVersion('v0.0.0-20251222112700-718627d35076'),
      'commit 718627d (2025-12-22)'
    );
    assert.equal(
      displayGoVersion('v1.5.1-0.20260716050216-9f8ddaa00933'),
      'commit 9f8ddaa (2026-07-16)'
    );
    assert.equal(displayGoVersion('v1.13.0'), 'v1.13.0');
  });

  test('extracts the commit prefix of pseudo-versions', () => {
    assert.equal(pseudoVersionHash('v0.0.0-20260716050216-9f8ddaa00933'), '9f8ddaa00933');
    assert.equal(pseudoVersionHash('v1.5.1-0.20260716050216-9f8ddaa00933'), '9f8ddaa00933');
    assert.equal(pseudoVersionHash('v1.5.0'), null);
  });
});

describe('pickGoLatest', () => {
  const lsRemote = (...refs) => refs.map(([sha, ref]) => `${sha}\t${ref}`).join('\n');

  test('picks the highest release tag, ignoring prereleases, peeled refs and v2+', () => {
    const output = lsRemote(
      ['aaa', 'HEAD'],
      ['bbb', 'refs/heads/main'],
      ['ccc', 'refs/tags/v1.14.0'],
      ['ddd', 'refs/tags/v1.15.0'],
      ['eee', 'refs/tags/v1.15.0^{}'],
      ['fff', 'refs/tags/v1.16.0-rc.1'],
      ['ggg', 'refs/tags/v2.0.0'],
      ['hhh', 'refs/tags/not-a-version']
    );
    assert.deepEqual(pickGoLatest(output), { tag: 'v1.15.0' });
  });

  test('falls back to the highest prerelease when there is no release', () => {
    const output = lsRemote(['aaa', 'HEAD'], ['bbb', 'refs/tags/v0.1.0-beta.2']);
    assert.deepEqual(pickGoLatest(output), { tag: 'v0.1.0-beta.2' });
  });

  test('falls back to HEAD for untagged repos', () => {
    const output = lsRemote(['973e4c1d396c874eb77c48d41cb7f21eee3f3374', 'HEAD']);
    assert.deepEqual(pickGoLatest(output), { head: '973e4c1d396c874eb77c48d41cb7f21eee3f3374' });
  });

  test('returns null for empty output', () => {
    assert.equal(pickGoLatest(''), null);
  });
});

describe('isGoBuildOutdated', () => {
  test('a tagged build behind the latest tag is outdated', () => {
    assert.equal(isGoBuildOutdated('v1.13.0', { tag: 'v1.15.0' }), true);
  });

  test('a build at the latest tag is current', () => {
    assert.equal(isGoBuildOutdated('v1.1.3', { tag: 'v1.1.3' }), false);
  });

  test('an old untagged pseudo-version is behind a tagged release', () => {
    assert.equal(isGoBuildOutdated('v0.0.0-20251222112700-718627d35076', { tag: 'v1.5.0' }), true);
  });

  test('a pseudo-version past the latest tag is current', () => {
    assert.equal(
      isGoBuildOutdated('v1.5.1-0.20260716050216-9f8ddaa00933', { tag: 'v1.5.0' }),
      false
    );
  });

  test('an untagged repo compares the pseudo-version commit with HEAD', () => {
    const installed = 'v0.0.0-20260716050216-9f8ddaa00933';
    assert.equal(isGoBuildOutdated(installed, { head: '973e4c1d396c874eb77c48d41cb7f2' }), true);
    assert.equal(isGoBuildOutdated(installed, { head: '9f8ddaa00933aaaabbbbccccdddd' }), false);
  });

  test('cannot decide without an installed version or a pseudo-version for HEAD', () => {
    assert.equal(isGoBuildOutdated(null, { tag: 'v1.0.0' }), null);
    assert.equal(isGoBuildOutdated('v1.0.0', { head: 'abc' }), null);
  });
});

describe('offerUpdate', () => {
  let nextId = 0;
  const fakeTool = (overrides = {}) => {
    const tool = {
      id: `fake-${nextId++}`,
      name: 'fake',
      isInstalled: () => true,
      check: async () => ({ installed: '1.0.0', latest: '1.1.0', outdated: true }),
      update: async () => true,
      ...overrides,
    };
    registerUpdatableTool(tool);
    return tool;
  };
  const stubPrompt = (answer) => {
    const calls = [];
    mock.method(inquirer, 'prompt', async (questions) => {
      calls.push(questions[0]);
      return { [questions[0].name]: answer };
    });
    return calls;
  };

  afterEach(() => mock.restoreAll());

  test('outdated: prompts with default Yes, updates, then stays quiet', async () => {
    let version = '1.0.0';
    const tool = fakeTool({
      check: async () => ({ installed: version, latest: '1.1.0', outdated: version !== '1.1.0' }),
      update: async () => {
        version = '1.1.0';
        return true;
      },
    });
    const calls = stubPrompt(true);
    assert.equal(await offerUpdate(tool.id), 'updated');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].default, true);
    assert.equal(await offerUpdate(tool.id), 'current');
    assert.equal(calls.length, 1);
  });

  test('declined: a re-entering caller is not prompted again', async () => {
    let updates = 0;
    const tool = fakeTool({ update: async () => ++updates > 0 });
    const calls = stubPrompt(false);
    assert.equal(await offerUpdate(tool.id), 'declined');
    assert.equal(await offerUpdate(tool.id), 'declined');
    assert.equal(calls.length, 1);
    assert.equal(updates, 0);
  });

  test('an update that leaves the checked binary outdated is reported as failed', async () => {
    const tool = fakeTool({ update: async () => true });
    stubPrompt(true);
    const logs = [];
    mock.method(console, 'log', (...args) => logs.push(args.join(' ')));
    assert.equal(await offerUpdate(tool.id), 'failed');
    assert.match(logs.join('\n'), /still reports 1\.0\.0 after the update/);
  });

  test('failed update is reported once, without a re-prompt', async () => {
    const tool = fakeTool({ update: async () => false });
    const calls = stubPrompt(true);
    assert.equal(await offerUpdate(tool.id), 'failed');
    assert.equal(await offerUpdate(tool.id), 'failed');
    assert.equal(calls.length, 1);
  });

  test('current tool: no prompt', async () => {
    const tool = fakeTool({
      check: async () => ({ installed: '1.1.0', latest: '1.1.0', outdated: false }),
    });
    const calls = stubPrompt(true);
    assert.equal(await offerUpdate(tool.id), 'current');
    assert.equal(calls.length, 0);
  });

  test('failed lookup or no update path: unknown, no prompt', async () => {
    const calls = stubPrompt(true);
    const throwing = fakeTool({
      check: async () => {
        throw new Error('offline');
      },
    });
    const unsupported = fakeTool({ check: async () => null });
    assert.equal(await offerUpdate(throwing.id), 'unknown');
    assert.equal(await offerUpdate(unsupported.id), 'unknown');
    assert.equal(await offerUpdate('not-registered'), 'unknown');
    assert.equal(calls.length, 0);
  });

  test('missing tool: absent, no prompt', async () => {
    const tool = fakeTool({ isInstalled: () => false });
    const calls = stubPrompt(true);
    assert.equal(await offerUpdate(tool.id), 'absent');
    assert.equal(calls.length, 0);
  });
});

describe('brewPackageInfo', () => {
  const withFakeBrew = async (script, fn) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-brew-'));
    fs.writeFileSync(path.join(dir, 'brew'), `#!/bin/sh\n${script}\n`, { mode: 0o755 });
    const originalPath = process.env.PATH;
    process.env.PATH = `${dir}${path.delimiter}${originalPath}`;
    try {
      return await fn();
    } finally {
      process.env.PATH = originalPath;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
  // Fake brew answering `brew info` with INFO and `brew outdated` with OUTDATED.
  const fakeBrew = (info, outdated) =>
    `case "$1" in info) echo '${JSON.stringify(info)}' ;; outdated) ${
      typeof outdated === 'string' ? outdated : `echo '${JSON.stringify(outdated)}'`
    } ;; esac`;
  const gcxInfo = {
    formulae: [{ installed: [{ version: '1.3.1_1' }], versions: { stable: '1.3.1' } }],
  };

  test('returns null when brew prints malformed JSON or fails', async () => {
    assert.equal(await withFakeBrew("echo 'not json'", () => brewPackageInfo('gcx')), null);
    assert.equal(await withFakeBrew('exit 1', () => brewPackageInfo('gcx')), null);
  });

  test('returns null when brew does not manage the package', async () => {
    const info = { formulae: [{ installed: [], versions: { stable: '1.7.1' } }] };
    assert.equal(await withFakeBrew(fakeBrew(info, 'exit 1'), () => brewPackageInfo('gcx')), null);
  });

  test('trusts brew outdated over stale brew info metadata', async () => {
    // brew info's cached stable (1.3.1) says current; brew outdated refreshed and knows 1.7.1.
    const outdated = {
      formulae: [
        { name: 'gcx', installed_versions: ['1.3.1'], current_version: '1.7.1', pinned: false },
      ],
      casks: [],
    };
    assert.deepEqual(
      await withFakeBrew(fakeBrew(gcxInfo, outdated), () => brewPackageInfo('gcx')),
      {
        installed: '1.3.1',
        latest: '1.7.1',
        outdated: true,
      }
    );
  });

  test('reads the listing when brew outdated exits 1, as it does whenever something is outdated', async () => {
    const outdated = {
      formulae: [
        { name: 'gcx', installed_versions: ['1.3.1'], current_version: '1.7.1', pinned: false },
      ],
      casks: [],
    };
    const script = fakeBrew(gcxInfo, `echo '${JSON.stringify(outdated)}'; exit 1`);
    const result = await withFakeBrew(script, () => brewPackageInfo('gcx'));
    assert.equal(result.outdated, true);
  });

  test('reports current when brew outdated lists nothing', async () => {
    const outdated = { formulae: [], casks: [] };
    assert.deepEqual(
      await withFakeBrew(fakeBrew(gcxInfo, outdated), () => brewPackageInfo('gcx')),
      {
        installed: '1.3.1',
        latest: '1.3.1',
        outdated: false,
      }
    );
  });

  test('treats pinned packages as current, since brew upgrade skips them', async () => {
    const outdated = {
      formulae: [
        { name: 'gcx', installed_versions: ['1.3.1'], current_version: '1.7.1', pinned: true },
      ],
      casks: [],
    };
    const result = await withFakeBrew(fakeBrew(gcxInfo, outdated), () => brewPackageInfo('gcx'));
    assert.equal(result.outdated, false);
  });

  test('matches tapped casks by token', async () => {
    const info = { casks: [{ installed: '0.15.0', version: '0.15.0' }] };
    const outdated = {
      formulae: [],
      casks: [{ name: 'ovhcloud-cli', installed_versions: ['0.15.0'], current_version: '0.16.0' }],
    };
    const result = await withFakeBrew(fakeBrew(info, outdated), () =>
      brewPackageInfo('ovh/tap/ovhcloud-cli', { cask: true })
    );
    assert.deepEqual(result, { installed: '0.15.0', latest: '0.16.0', outdated: true });
  });

  test('matches tapped casks listed under their full name', async () => {
    const info = { casks: [{ installed: '0.15.0', version: '0.15.0' }] };
    const outdated = {
      formulae: [],
      casks: [
        { name: 'ovh/tap/ovhcloud-cli', installed_versions: ['0.15.0'], current_version: '0.16.0' },
      ],
    };
    const result = await withFakeBrew(fakeBrew(info, outdated), () =>
      brewPackageInfo('ovh/tap/ovhcloud-cli', { cask: true })
    );
    assert.equal(result.outdated, true);
  });

  test('throws when the outdated lookup fails, so the check is reported as skipped', async () => {
    await assert.rejects(withFakeBrew(fakeBrew(gcxInfo, 'exit 1'), () => brewPackageInfo('gcx')));
  });
});

describe('releaseCheckResult', () => {
  test('flags a lower installed release as outdated', () => {
    assert.deepEqual(releaseCheckResult('1.3.1', 'v1.7.1'), {
      installed: '1.3.1',
      latest: 'v1.7.1',
      outdated: true,
    });
    assert.equal(releaseCheckResult('1.7.1', 'v1.7.1').outdated, false);
  });

  test('throws instead of reporting non-semver versions as current', () => {
    assert.throws(() => releaseCheckResult('nightly', 'v1.7.1'), /cannot compare/);
  });
});
