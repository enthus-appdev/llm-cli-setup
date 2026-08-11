import chalk from 'chalk';
import inquirer from 'inquirer';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync, spawnSync } from 'child_process';
import { commandExists, getPlatformInfo } from '../utils/platform.js';

// Repo that provides gcx release binaries (override via env for testing).
export const GCX_REPO = process.env.GCX_REPO || 'grafana/gcx';

// Common locations where the gcx binary may live (in PATH first).
const BINARY_LOCATIONS = [
  path.join(os.homedir(), 'go', 'bin', 'gcx'),
  path.join(os.homedir(), '.local', 'bin', 'gcx'),
  '/usr/local/bin/gcx',
];

/**
 * Find the gcx binary (in PATH or common locations)
 */
const findGcxBinary = () => {
  if (commandExists('gcx')) {
    return 'gcx';
  }

  for (const loc of BINARY_LOCATIONS) {
    if (fs.existsSync(loc)) {
      return loc;
    }
  }

  return null;
};

/**
 * Check if gcx is installed
 */
export const isGcxInstalled = () => findGcxBinary() !== null;

/**
 * Read gcx's current context name. gcx outputs plain text in a normal
 * terminal but JSON ({"current-context":"<name>"}) in agent mode, so parse both.
 */
const readCurrentContext = (binary) => {
  const result = execFileSync(binary, ['config', 'current-context'], {
    encoding: 'utf8',
    stdio: 'pipe',
  }).trim();
  if (!result) return null;
  try {
    const parsed = JSON.parse(result);
    return parsed['current-context'] || null;
  } catch {
    return result;
  }
};

/**
 * Check if gcx has a current context configured
 */
export const isGcxConfigured = () => {
  const binary = findGcxBinary();
  if (!binary) return false;

  try {
    return readCurrentContext(binary) !== null;
  } catch {
    return false;
  }
};

/**
 * Get the current gcx context name
 */
export const getCurrentContext = () => {
  const binary = findGcxBinary();
  if (!binary) return null;

  try {
    return readCurrentContext(binary);
  } catch {
    return null;
  }
};

/**
 * Install gcx by downloading a prebuilt tarball from GitHub releases.
 * Matches the logcli installer pattern (no Go toolchain required).
 */
const installViaBinary = async () => {
  const { platform, arch } = getPlatformInfo();

  // Map to gcx release naming: gcx_<version>_<os>_<arch>.tar.gz
  let osName = platform === 'darwin' ? 'darwin' : platform === 'linux' ? 'linux' : null;
  let archName = arch === 'x64' ? 'amd64' : arch === 'arm64' ? 'arm64' : null;

  if (!osName || !archName) {
    console.log(chalk.yellow(`Unsupported platform: ${platform}/${arch}`));
    return { success: false, binaryPath: null };
  }

  // Required tools
  if (!commandExists('curl') || !commandExists('tar')) {
    console.log(chalk.red('✗ curl and tar are required but not installed'));
    return { success: false, binaryPath: null };
  }

  console.log(chalk.blue('Installing gcx from GitHub releases...'));
  console.log(chalk.gray(`Downloading latest release from ${GCX_REPO}...\n`));

  const installDir = path.join(os.homedir(), '.local', 'bin');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gcx-install-'));

  try {
    // Get latest version
    const releaseInfo = execFileSync(
      'curl',
      ['-s', `https://api.github.com/repos/${GCX_REPO}/releases/latest`],
      { encoding: 'utf8' }
    );
    const release = JSON.parse(releaseInfo);
    const version = release.tag_name;

    // Validate version format (anchored to prevent injection via suffix)
    if (!/^v?\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
      throw new Error(`Invalid version format: ${version}`);
    }

    // Download and install to ~/.local/bin (no sudo required)
    const tag = release.tag_name;
    const filename = `gcx_${version.replace(/^v/, '')}_${osName}_${archName}.tar.gz`;
    const downloadUrl = `https://github.com/${GCX_REPO}/releases/download/${tag}/${filename}`;
    const tarballPath = path.join(tmpDir, 'gcx.tar.gz');
    const targetBinary = path.join(installDir, 'gcx');

    fs.mkdirSync(installDir, { recursive: true });
    execFileSync('curl', ['-sL', downloadUrl, '-o', tarballPath]);
    execFileSync('tar', ['xzf', tarballPath, '-C', tmpDir]);

    // The tarball contains the `gcx` binary (plus README/LICENSE/CHANGELOG).
    const extractedBinary = path.join(tmpDir, 'gcx');
    if (!fs.existsSync(extractedBinary)) {
      throw new Error('gcx binary not found in the release archive');
    }

    fs.renameSync(extractedBinary, targetBinary);
    fs.chmodSync(targetBinary, 0o755);

    console.log(chalk.green(`✓ gcx ${version} installed successfully`));

    // Warn if not in PATH
    if (!commandExists('gcx')) {
      console.log(chalk.yellow(`\n⚠ gcx installed to ${targetBinary}`));
      console.log(chalk.yellow("But it's not in your PATH. Add it with:"));
      console.log(chalk.gray(`  export PATH="$PATH:${installDir}"`));
      console.log(chalk.gray('\nOr add this line to your shell profile (~/.zshrc or ~/.bashrc)'));
    }

    return { success: true, binaryPath: targetBinary };
  } catch (error) {
    console.error(chalk.red(`✗ Failed to install: ${error.message}`));
    console.log(chalk.gray(`Manual installation: https://github.com/${GCX_REPO}/releases`));
    return { success: false, binaryPath: null };
  } finally {
    // Clean up temp directory
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
};

/**
 * Run `gcx login` (browser OAuth, the recommended gcx flow) for a context.
 */
const runLogin = async (binary) => {
  const { contextName } = await inquirer.prompt([
    {
      type: 'input',
      name: 'contextName',
      message: 'Context name (e.g., prod, default, staging):',
      default: 'default',
    },
  ]);

  const { serverUrl } = await inquirer.prompt([
    {
      type: 'input',
      name: 'serverUrl',
      message: 'Grafana server URL:',
      default: 'http://localhost:3000',
    },
  ]);

  console.log(chalk.gray('\nOpening browser for OAuth approval...'));
  console.log(chalk.gray('Follow the prompts in your browser, then return here.\n'));

  try {
    spawnSync(binary, ['login', contextName, '--server', serverUrl, '--oauth'], {
      stdio: 'inherit',
    });
    const current = readCurrentContext(binary);
    if (current === contextName) {
      console.log(chalk.green(`\n✓ Context '${contextName}' configured`));
      console.log(chalk.gray(`Verify anytime with: ${binary} config check`));
      return true;
    }
    console.log(
      chalk.yellow('\n! Could not confirm the new context. Verify with `gcx config check`.')
    );
    return false;
  } catch (error) {
    console.error(chalk.red(`\n✗ Login failed: ${error.message}`));
    console.log(
      chalk.gray(`Retry later with: ${binary} login ${contextName} --server ${serverUrl}`)
    );
    return false;
  }
};

/**
 * Configure gcx
 */
export const configureGcx = async () => {
  console.log(chalk.cyan('\n=== Grafana Cloud CLI (gcx) Configuration ===\n'));
  console.log(
    chalk.gray(
      'gcx is the unified Grafana Cloud CLI (dashboards, resources, metrics, logs, traces, SLOs, IRM, ...).\n'
    )
  );

  // Check installation
  let binary = findGcxBinary();

  if (!binary) {
    console.log(chalk.yellow('! gcx is not installed'));

    const { install } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'install',
        message: 'Install gcx?',
        default: true,
      },
    ]);

    if (install) {
      const result = await installViaBinary();
      if (!result.success) {
        return false;
      }
      binary = result.binaryPath || findGcxBinary();
      if (!binary) {
        console.log(chalk.red('✗ Could not find gcx after installation'));
        return false;
      }
    } else {
      console.log(chalk.gray('Skipping gcx setup.'));
      return false;
    }
  } else {
    console.log(chalk.green('✓ gcx is installed'));

    // Show path if not in PATH
    if (!commandExists('gcx')) {
      console.log(chalk.yellow(`  Location: ${binary}`));
      console.log(chalk.yellow('  Note: Not in PATH. Add to your shell profile:'));
      console.log(chalk.gray(`    export PATH="$PATH:${path.dirname(binary)}"`));
    }

    // Check version
    try {
      const version = execFileSync(binary, ['--version'], { encoding: 'utf8' }).trim();
      console.log(chalk.gray(`  Version: ${version}`));
    } catch {
      // Version check failed, continue anyway
    }
  }

  // Check configuration
  const currentContext = getCurrentContext();

  if (currentContext) {
    console.log(chalk.green(`✓ Active context: ${chalk.white(currentContext)}`));

    const { action } = await inquirer.prompt([
      {
        type: 'select',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: 'Re-authenticate / add a context', value: 'login' },
          { name: 'View current configuration', value: 'view' },
          { name: 'Done', value: 'done' },
        ],
      },
    ]);

    if (action === 'login') {
      await runLogin(binary);
    } else if (action === 'view') {
      console.log();
      execFileSync(binary, ['config', 'view'], { stdio: 'inherit' });
    }
  } else {
    // No context configured
    const { configure } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'configure',
        message: 'Set up gcx now (browser OAuth)?',
        default: true,
      },
    ]);

    if (configure) {
      await runLogin(binary);
    } else {
      console.log(chalk.gray('\nSkipping gcx setup.'));
      console.log(chalk.gray(`Login later with: gcx login <context> --server <url>`));
      console.log(
        chalk.gray('Or use a service-account token: gcx login --yes <context> --token glsa_xxx')
      );
    }
  }

  console.log(chalk.green('\n✓ gcx configuration complete'));
  return true;
};
