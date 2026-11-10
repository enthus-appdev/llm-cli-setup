import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  compareSemver,
  extractVersion,
  isGoBuildOutdated,
  parseGoBuildInfo,
  pickGoLatest,
  pseudoVersionHash,
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
