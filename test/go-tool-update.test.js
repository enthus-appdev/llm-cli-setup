import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, mock, test } from 'node:test';
import inquirer from 'inquirer';

import {
  goToolCheck,
  goToolUpdate,
  offerUpdate,
  registerUpdatableTool,
} from '../lib/utils/versions.js';

// Stub `go` and `git` on PATH. The fake binary carries its module version in a
// comment that the fake `go version -m` reads; the fake `go install` writes
// v1.1.0 to $GOBIN, or to $FAKE_GOPATH/bin like the real default.
const FAKE_GO = `#!/bin/sh
case "$1" in
  version) v=$(sed -n 's/^#VERSION //p' "$3"); printf '%s: go1.25\\n\\tpath\\tgithub.com/o/faketool/cmd/faketool\\n\\tmod\\tgithub.com/o/faketool\\t%s\\th1:x=\\n' "$3" "$v" ;;
  install) dir="\${GOBIN:-$FAKE_GOPATH/bin}"; mkdir -p "$dir"; printf '#!/bin/sh\\n#VERSION v1.1.0\\n' > "$dir/faketool"; chmod +x "$dir/faketool" ;;
esac
`;
const FAKE_GIT = `#!/bin/sh
printf 'aaa\\tHEAD\\nbbb\\trefs/tags/v1.1.0\\n'
`;

let root;
let originalPath;

before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'go-tool-update-'));
  const stubs = path.join(root, 'stubs');
  const active = path.join(root, 'local-bin');
  fs.mkdirSync(stubs);
  fs.mkdirSync(active);
  fs.writeFileSync(path.join(stubs, 'go'), FAKE_GO, { mode: 0o755 });
  fs.writeFileSync(path.join(stubs, 'git'), FAKE_GIT, { mode: 0o755 });
  fs.writeFileSync(path.join(active, 'faketool'), '#!/bin/sh\n#VERSION v1.0.0\n', { mode: 0o755 });
  originalPath = process.env.PATH;
  process.env.PATH = [stubs, active, originalPath].join(path.delimiter);
  process.env.FAKE_GOPATH = path.join(root, 'gopath');
});

after(() => {
  process.env.PATH = originalPath;
  delete process.env.FAKE_GOPATH;
  mock.restoreAll();
  fs.rmSync(root, { recursive: true, force: true });
});

test('updates the binary on PATH even when it lives outside GOPATH/bin', async () => {
  const findBinary = () => 'faketool';
  const install = async () => {
    execFileSync('go', ['install', 'github.com/o/faketool/cmd/faketool@latest']);
    return true;
  };
  registerUpdatableTool({
    id: 'faketool',
    name: 'faketool',
    isInstalled: () => true,
    check: goToolCheck('o/faketool', findBinary),
    update: goToolUpdate(findBinary, install),
  });
  mock.method(inquirer, 'prompt', async () => ({ update: true }));

  assert.equal(await offerUpdate('faketool'), 'updated');
  const active = fs.readFileSync(path.join(root, 'local-bin', 'faketool'), 'utf8');
  assert.match(active, /#VERSION v1\.1\.0/);
  assert.equal(fs.existsSync(path.join(root, 'gopath', 'bin', 'faketool')), false);
  assert.equal(process.env.GOBIN, undefined);
});
