import chalk from 'chalk';
import inquirer from 'inquirer';
import { execFile, execFileSync } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// Upper bound for one lookup (git ls-remote, brew info, npm view, GitHub API).
// A slow or unreachable source turns into a skipped check, never a stalled setup.
const LOOKUP_TIMEOUT_MS = 10000;

// ─── Pure version helpers ────────────────────────────────────────────────────

const SEMVER_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

export const parseSemver = (version) => {
  const match = SEMVER_RE.exec(String(version ?? '').trim());
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    pre: match[4] ? match[4].split('.') : [],
  };
};

const comparePrerelease = (a, b) => {
  // A release sorts above any prerelease of the same core version.
  if (a.length === 0 || b.length === 0) return Math.sign(b.length - a.length);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] === undefined) return -1;
    if (b[i] === undefined) return 1;
    const aNum = /^\d+$/.test(a[i]);
    const bNum = /^\d+$/.test(b[i]);
    if (aNum && bNum) {
      const diff = Number(a[i]) - Number(b[i]);
      if (diff !== 0) return Math.sign(diff);
    } else if (aNum !== bNum) {
      return aNum ? -1 : 1;
    } else if (a[i] !== b[i]) {
      return a[i] < b[i] ? -1 : 1;
    }
  }
  return 0;
};

/**
 * Semver ordering (-1, 0, 1), including prerelease precedence, so a Go
 * pseudo-version built after a tag (v1.5.1-0.2026…) sorts above that tag.
 * Returns null when either side is not semver.
 */
export const compareSemver = (a, b) => {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return null;
  for (const key of ['major', 'minor', 'patch']) {
    if (pa[key] !== pb[key]) return Math.sign(pa[key] - pb[key]);
  }
  return comparePrerelease(pa.pre, pb.pre);
};

/** First x.y.z (with optional prerelease) found in a tool's --version output. */
export const extractVersion = (text) =>
  /\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?/.exec(String(text ?? ''))?.[0] ?? null;

/**
 * Main-module version from `go version -m <binary>`. `go install pkg@ver`
 * records the resolved module version here even when the binary's own
 * `version` command prints "dev". Local builds record "(devel)" → null.
 */
export const parseGoBuildInfo = (output) => {
  const version = /^\s*mod\s+\S+\s+(\S+)/m.exec(String(output ?? ''))?.[1];
  return version && version !== '(devel)' ? version : null;
};

/** The 12-char commit prefix a Go pseudo-version ends with, or null. */
export const pseudoVersionHash = (version) =>
  /[-.]\d{14}-([0-9a-f]{12})$/.exec(String(version ?? ''))?.[1] ?? null;

/**
 * Short display form of a Go module version: pseudo-versions become
 * "commit <7-char hash> (<commit date>)", tagged versions stay as they are.
 */
export const displayGoVersion = (version) => {
  const match = /[-.](\d{4})(\d{2})(\d{2})\d{6}-([0-9a-f]{12})$/.exec(String(version ?? ''));
  if (!match) return version;
  const [, year, month, day, hash] = match;
  return `commit ${hash.slice(0, 7)} (${year}-${month}-${day})`;
};

/**
 * The version `go install <module>@latest` resolves to, from `git ls-remote`
 * output: the highest release tag; else the highest prerelease tag; else the
 * default branch HEAD. Tags v2+ are ignored because they need a /vN module path.
 */
export const pickGoLatest = (lsRemoteOutput) => {
  let head = null;
  const tags = [];
  for (const line of String(lsRemoteOutput ?? '').split('\n')) {
    const [sha, ref] = line.trim().split(/\s+/);
    if (!sha || !ref) continue;
    if (ref === 'HEAD') head = sha;
    const tag = /^refs\/tags\/(v[^^]+)$/.exec(ref)?.[1];
    const parsed = tag && parseSemver(tag);
    if (parsed && parsed.major <= 1) tags.push({ tag, pre: parsed.pre.length > 0 });
  }
  const highest = (list) =>
    list.reduce((best, t) => (!best || compareSemver(t.tag, best) > 0 ? t.tag : best), null);
  const release = highest(tags.filter((t) => !t.pre));
  const prerelease = highest(tags.filter((t) => t.pre));
  if (release || prerelease) return { tag: release || prerelease };
  return head ? { head } : null;
};

/**
 * Whether an installed Go module version is behind what @latest resolves to.
 * Returns null when it cannot tell (unknown installed version, or a tagged
 * build of a repo that has no tags any more).
 */
export const isGoBuildOutdated = (installed, latest) => {
  if (!installed || !latest) return null;
  if (latest.tag) {
    const cmp = compareSemver(installed, latest.tag);
    return cmp === null ? null : cmp < 0;
  }
  const hash = pseudoVersionHash(installed);
  return hash ? !latest.head.startsWith(hash) : null;
};

// ─── Lookups (async, time-boxed) ─────────────────────────────────────────────

const run = async (file, args, options = {}) => {
  const { stdout } = await execFileAsync(file, args, {
    encoding: 'utf8',
    timeout: LOOKUP_TIMEOUT_MS,
    ...options,
  });
  return stdout;
};

/** Installed module version of a `go install`-ed binary, or null. */
export const goBinaryVersion = async (binaryPath) => {
  if (!binaryPath) return null;
  try {
    return parseGoBuildInfo(await run('go', ['version', '-m', binaryPath]));
  } catch {
    return null;
  }
};

/**
 * Latest version of a Go module hosted on GitHub. Uses the same https URL as
 * `go install`, so a git insteadOf rewrite to SSH applies to both. Prompts are
 * disabled: a passphrase or host-key question must fail the check, not hang it.
 */
export const latestGoVersion = async (repo) => {
  const env = {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
    GIT_SSH_COMMAND: process.env.GIT_SSH_COMMAND || 'ssh -o BatchMode=yes -o ConnectTimeout=5',
  };
  const output = await run('git', ['ls-remote', `https://github.com/${repo}`], { env });
  const latest = pickGoLatest(output);
  if (!latest) throw new Error(`no tags or HEAD in ${repo}`);
  return latest;
};

/**
 * Homebrew's view of a formula or cask: installed version, the version
 * `brew upgrade` would install, and its outdated flag. Null when brew is
 * absent or does not manage the package.
 */
export const brewPackageInfo = async (name, { cask = false } = {}) => {
  let info;
  try {
    const output = await run('brew', ['info', '--json=v2', cask ? '--cask' : '--formula', name]);
    info = JSON.parse(output);
  } catch {
    return null;
  }
  if (cask) {
    const entry = info.casks?.[0];
    if (!entry?.installed) return null;
    return { installed: entry.installed, latest: entry.version, outdated: Boolean(entry.outdated) };
  }
  const entry = info.formulae?.[0];
  const installed = entry?.installed?.[0]?.version;
  if (!installed) return null;
  return {
    installed: installed.replace(/_\d+$/, ''),
    latest: entry.versions?.stable,
    outdated: Boolean(entry.outdated),
  };
};

/** Version of a globally installed npm package, or null. */
export const npmGlobalVersion = async (pkg) => {
  try {
    const output = await run('npm', ['ls', '-g', '--depth=0', '--json', pkg]);
    return JSON.parse(output).dependencies?.[pkg]?.version ?? null;
  } catch (error) {
    // `npm ls` exits non-zero on unrelated global-tree problems but still prints JSON.
    try {
      return JSON.parse(error.stdout).dependencies?.[pkg]?.version ?? null;
    } catch {
      return null;
    }
  }
};

/** Version `npm install -g <pkg>@latest` would install (honours the user's npm config). */
export const latestNpmVersion = async (pkg) => {
  const version = (await run('npm', ['view', `${pkg}@latest`, 'version'])).trim();
  if (!parseSemver(version)) throw new Error(`unexpected npm version "${version}"`);
  return version;
};

/** Tag of the latest GitHub release of a public repo. */
export const latestGithubRelease = async (repo) => {
  const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`GitHub API ${response.status} for ${repo}`);
  const { tag_name: tag } = await response.json();
  if (!parseSemver(tag)) throw new Error(`unexpected release tag "${tag}"`);
  return tag;
};

/** Version printed by `<binary> <args>`, or null. */
export const commandVersion = async (binary, args = ['--version']) => {
  try {
    return extractVersion(await run(binary, args));
  } catch {
    return null;
  }
};

/**
 * check() for a binary installed with `go install github.com/<repo>/...@latest`.
 * findBinary may return a bare command name (on PATH) or an absolute path.
 */
export const goToolCheck = (repo, findBinary) => async () => {
  let binary = findBinary();
  if (binary && !binary.includes('/')) {
    binary = (await run('which', [binary]).catch(() => '')).trim() || null;
  }
  const installed = await goBinaryVersion(binary);
  if (!installed) return null;
  const latest = await latestGoVersion(repo);
  return {
    installed: displayGoVersion(installed),
    latest: latest.tag || `commit ${latest.head.slice(0, 7)}`,
    outdated: isGoBuildOutdated(installed, latest) === true,
  };
};

/** check() for a Homebrew-managed formula or cask; null when brew does not manage it. */
export const brewCheck = (name, options) => async () => brewPackageInfo(name, options);

/** check() for a global npm package. */
export const npmCheck = (pkg) => async () => {
  const installed = await npmGlobalVersion(pkg);
  if (!installed) return null;
  const latest = await latestNpmVersion(pkg);
  return { installed, latest, outdated: compareSemver(installed, latest) < 0 };
};

const runInteractive = (file, args) => {
  console.log(chalk.gray(`  Running: ${file} ${args.join(' ')}`));
  try {
    execFileSync(file, args, { stdio: 'inherit' });
    return true;
  } catch (error) {
    console.error(chalk.red(`✗ Update failed: ${error.message}`));
    return false;
  }
};

/** update() via `brew upgrade`. */
export const brewUpgrade = (name, { cask = false } = {}) =>
  runInteractive('brew', ['upgrade', ...(cask ? ['--cask'] : []), name]);

/** update() via `npm install -g <pkg>@latest`. */
export const npmInstallLatest = (pkg) => runInteractive('npm', ['install', '-g', `${pkg}@latest`]);

// ─── Registry, cache and prompts ─────────────────────────────────────────────

/**
 * @typedef {Object} UpdatableTool
 * @property {string} id - Same id as the CLI_TOOLS entry in lib/index.js
 * @property {string} name - Binary name shown to the user
 * @property {() => boolean} isInstalled
 * @property {() => Promise<{installed: string, latest: string, outdated: boolean}|null>} check
 *   Null when this install method has no update path (silently skipped);
 *   throws when the latest-version lookup fails (reported as skipped).
 * @property {() => Promise<boolean>} update
 */

const registry = new Map();
const results = new Map();

/** Register a tool for update checks. Each installer module registers itself. */
export const registerUpdatableTool = (tool) => {
  registry.set(tool.id, tool);
};

const evaluate = async (tool) => {
  if (!tool.isInstalled()) return { state: 'absent' };
  try {
    const result = await tool.check();
    if (!result) return { state: 'unknown' };
    return { ...result, state: result.outdated ? 'outdated' : 'current' };
  } catch (error) {
    return { state: 'unknown', error: error.message };
  }
};

const statusFor = async (id) => {
  if (!results.has(id)) results.set(id, await evaluate(registry.get(id)));
  return results.get(id);
};

/**
 * Check every registered tool in parallel and print the outdated ones.
 * Never throws: failed lookups become one warning line.
 * Tools register when their installer module is imported, so import the
 * installers (lib/index.js or lib/installers/index.js) before calling this.
 */
export const checkForUpdates = async () => {
  const tools = [...registry.values()];
  console.log(chalk.gray('Checking installed CLI tools for updates...'));
  const statuses = await Promise.all(tools.map((tool) => evaluate(tool)));
  tools.forEach((tool, i) => results.set(tool.id, statuses[i]));

  const outdated = tools.filter((tool) => results.get(tool.id).state === 'outdated');
  const failed = tools.filter((tool) => results.get(tool.id).error);

  if (outdated.length > 0) {
    console.log(chalk.yellow('\nUpdates available:'));
    for (const tool of outdated) {
      const { installed, latest } = results.get(tool.id);
      console.log(chalk.yellow(`  ${tool.name.padEnd(12)} ${installed} → ${latest}`));
    }
  } else if (tools.some((tool) => results.get(tool.id).state === 'current')) {
    console.log(chalk.green('✓ Installed CLI tools are up to date'));
  }
  if (failed.length > 0) {
    console.log(
      chalk.yellow(
        `⚠ Skipped update check for ${failed.map((t) => t.name).join(', ')} (lookup failed — offline?)`
      )
    );
  }
  console.log();
  return Object.fromEntries(results);
};

/** Status-line suffix for an outdated tool, '' otherwise (reads cached results only). */
export const formatUpdateBadge = (id) => {
  const result = results.get(id);
  if (result?.state !== 'outdated') return '';
  return chalk.yellow(` · update available (${result.installed} → ${result.latest})`);
};

/**
 * Prompt to update a tool when it is outdated (default Yes). Asks at most once
 * per run per tool, so a replace hook that re-enters configure*() is not
 * prompted twice.
 * @returns {Promise<'updated'|'failed'|'declined'|'current'|'unknown'|'absent'>}
 *   'unknown' means the check could not decide; callers may fall back to a
 *   manual reinstall prompt.
 */
export const offerUpdate = async (id) => {
  const tool = registry.get(id);
  if (!tool) return 'unknown';
  const result = await statusFor(id);
  if (result.state !== 'outdated') return result.state;
  if (result.answered) return result.answered;

  const { update } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'update',
      message: `Update ${tool.name} (${result.installed} → ${result.latest})?`,
      default: true,
    },
  ]);

  let outcome = 'declined';
  if (update) outcome = (await tool.update()) ? 'updated' : 'failed';
  results.set(id, outcome === 'updated' ? { state: 'current' } : { ...result, answered: outcome });
  return outcome;
};
