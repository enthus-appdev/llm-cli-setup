import chalk from 'chalk';
import inquirer from 'inquirer';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync, spawnSync } from 'child_process';
import { commandExists, getPlatformInfo } from '../utils/platform.js';

// Keys whose following arg is a secret (e.g. contexts.X.grafana.password).
const SENSITIVE_KEY_PATTERN = /\.(token|password|secret|api[_-]?key)$/i;

/**
 * Redact values in args that follow a sensitive key so secrets don't leak
 * into error messages or logs.
 */
const redactSensitiveArgs = (args) =>
  args.map((arg, i) => {
    const prev = args[i - 1];
    if (typeof prev === 'string' && SENSITIVE_KEY_PATTERN.test(prev)) {
      return '<redacted>';
    }
    return arg;
  });

/**
 * Run a grafanactl config command, throwing on failure
 */
const runConfig = (binary, args) => {
  const result = spawnSync(binary, args, { stdio: 'pipe', encoding: 'utf8' });
  if (result.status !== 0) {
    const safeArgs = redactSensitiveArgs(args);
    throw new Error(`grafanactl ${safeArgs.join(' ')} failed: ${result.stderr || 'unknown error'}`);
  }
  return result;
};

/**
 * Find grafanactl binary (in PATH or common locations)
 */
const findGrafanactlBinary = () => {
  // First check if it's in PATH
  if (commandExists('grafanactl')) {
    return 'grafanactl';
  }

  // Check common installation locations
  const locations = [
    path.join(os.homedir(), 'go', 'bin', 'grafanactl'),
    path.join(os.homedir(), '.local', 'bin', 'grafanactl'),
    '/usr/local/bin/grafanactl',
  ];

  for (const loc of locations) {
    if (fs.existsSync(loc)) {
      return loc;
    }
  }

  return null;
};

/**
 * Check if grafanactl is installed
 */
export const isGrafanactlInstalled = () => findGrafanactlBinary() !== null;

/**
 * Check if grafanactl is configured (has at least one context)
 */
export const isGrafanactlConfigured = () => {
  const binary = findGrafanactlBinary();
  if (!binary) return false;

  try {
    const result = execSync(`${binary} config check`, { stdio: 'pipe', encoding: 'utf8' });
    return !result.includes('no contexts configured');
  } catch {
    return false;
  }
};

/**
 * Get current grafanactl context
 */
export const getCurrentContext = () => {
  const binary = findGrafanactlBinary();
  if (!binary) return null;

  try {
    return execSync(`${binary} config current-context`, { stdio: 'pipe', encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
};

/**
 * Install grafanactl via go install
 */
const installViaGo = async () => {
  if (!commandExists('go')) {
    console.log(chalk.yellow('Go is required but not installed.'));
    console.log(chalk.gray('Install Go 1.24+ from: https://go.dev/dl/'));
    return { success: false, binaryPath: null };
  }

  // Check Go version (requires 1.24+)
  try {
    const version = execSync('go version', { encoding: 'utf8' });
    const match = version.match(/go(\d+)\.(\d+)/);
    if (match) {
      const major = parseInt(match[1], 10);
      const minor = parseInt(match[2], 10);
      if (major < 1 || (major === 1 && minor < 24)) {
        console.log(chalk.yellow(`Go 1.24+ required, found ${match[0]}`));
        return { success: false, binaryPath: null };
      }
    }
  } catch {
    console.log(chalk.yellow('Could not verify Go version'));
  }

  console.log(chalk.blue('Installing grafanactl via go install...'));
  try {
    execSync('go install github.com/grafana/grafanactl/cmd/grafanactl@latest', {
      stdio: 'inherit',
      shell: true,
    });

    // Find the installed binary
    const binaryPath = findGrafanactlBinary();
    if (!binaryPath) {
      console.error(chalk.red('✗ Install completed but grafanactl not found'));
      console.log(chalk.gray('Check ~/go/bin, ~/.local/bin, or /usr/local/bin'));
      return { success: false, binaryPath: null };
    }

    console.log(chalk.green('✓ grafanactl installed successfully'));

    // Warn if not in PATH
    if (!commandExists('grafanactl')) {
      console.log(chalk.yellow(`\n⚠ grafanactl installed to ${binaryPath}`));
      console.log(chalk.yellow("But it's not in your PATH. Add it with:"));
      console.log(chalk.gray(`  export PATH="$PATH:${path.dirname(binaryPath)}"`));
      console.log(chalk.gray('\nOr add this line to your shell profile (~/.zshrc or ~/.bashrc)'));
    }

    return { success: true, binaryPath };
  } catch (error) {
    console.error(chalk.red(`✗ Failed to install: ${error.message}`));
    return { success: false, binaryPath: null };
  }
};

/**
 * Install grafanactl via binary download
 */
const installViaBinary = async () => {
  const { platform, arch } = getPlatformInfo();

  // Map to GitHub release naming
  let osName = platform === 'darwin' ? 'darwin' : platform === 'linux' ? 'linux' : null;
  let archName = arch === 'x64' ? 'amd64' : arch === 'arm64' ? 'arm64' : null;

  if (!osName || !archName) {
    console.log(chalk.yellow(`Unsupported platform: ${platform}/${arch}`));
    return { success: false, binaryPath: null };
  }

  console.log(chalk.blue('Installing grafanactl from binary...'));
  console.log(chalk.gray('Downloading latest release from GitHub...\n'));

  try {
    // Get latest version
    const releaseInfo = execSync(
      'curl -s https://api.github.com/repos/grafana/grafanactl/releases/latest',
      {
        encoding: 'utf8',
      }
    );
    const release = JSON.parse(releaseInfo);
    const version = release.tag_name.replace('v', '');

    // Download and install to ~/.local/bin (no sudo required)
    const filename = `grafanactl_${version}_${osName}_${archName}.tar.gz`;
    const downloadUrl = `https://github.com/grafana/grafanactl/releases/download/${release.tag_name}/${filename}`;

    const installDir = path.join(os.homedir(), '.local', 'bin');
    const tmpDir = '/tmp/grafanactl-install';

    execSync(`mkdir -p ${installDir}`, { shell: true });
    execSync(`mkdir -p ${tmpDir}`, { shell: true });
    execSync(`curl -sL "${downloadUrl}" | tar xz -C ${tmpDir}`, { shell: true, stdio: 'inherit' });
    execSync(`mv ${tmpDir}/grafanactl ${installDir}/`, { shell: true, stdio: 'inherit' });
    execSync(`rm -rf ${tmpDir}`, { shell: true });

    const binaryPath = path.join(installDir, 'grafanactl');
    console.log(chalk.green('✓ grafanactl installed successfully'));
    return { success: true, binaryPath };
  } catch (error) {
    console.error(chalk.red(`✗ Failed to install: ${error.message}`));
    console.log(chalk.gray('Manual installation: https://github.com/grafana/grafanactl/releases'));
    return { success: false, binaryPath: null };
  }
};

/**
 * Install grafanactl
 */
const installGrafanactl = async () => {
  const { platform } = getPlatformInfo();

  if (platform !== 'darwin' && platform !== 'linux') {
    console.log(chalk.yellow('grafanactl installation is only supported on macOS and Linux.'));
    console.log(
      chalk.gray('Please install manually: https://github.com/grafana/grafanactl/releases')
    );
    return { success: false, binaryPath: null };
  }

  // Offer installation methods
  const hasGo = commandExists('go');

  const choices = [];
  if (hasGo) {
    choices.push({ name: 'go install (recommended if Go 1.24+ is installed)', value: 'go' });
  }
  choices.push({ name: 'Download binary from GitHub releases', value: 'binary' });
  choices.push({ name: 'Skip installation', value: 'skip' });

  const { method } = await inquirer.prompt([
    {
      type: 'select',
      name: 'method',
      message: 'How would you like to install grafanactl?',
      choices,
    },
  ]);

  switch (method) {
    case 'go':
      return await installViaGo();
    case 'binary':
      return await installViaBinary();
    default:
      console.log(chalk.gray('Skipping grafanactl installation.'));
      return { success: false, binaryPath: null };
  }
};

/**
 * Configure grafanactl context
 */
const configureContext = async (binary) => {
  console.log(chalk.blue('\nConfiguring Grafana context...'));
  console.log(chalk.gray('A context defines how to connect to a Grafana instance.\n'));

  const { contextName } = await inquirer.prompt([
    {
      type: 'input',
      name: 'contextName',
      message: 'Context name (e.g., default, staging, prod):',
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

  const { orgId } = await inquirer.prompt([
    {
      type: 'input',
      name: 'orgId',
      message: 'Organization ID:',
      default: '1',
    },
  ]);

  const { authMethod } = await inquirer.prompt([
    {
      type: 'select',
      name: 'authMethod',
      message: 'Authentication method:',
      choices: [
        { name: 'Service Account Token (recommended)', value: 'token' },
        { name: 'Username/Password', value: 'basic' },
        { name: 'Skip authentication setup', value: 'skip' },
      ],
    },
  ]);

  try {
    // Set server and org
    runConfig(binary, ['config', 'set', `contexts.${contextName}.grafana.server`, serverUrl]);
    runConfig(binary, ['config', 'set', `contexts.${contextName}.grafana.org-id`, orgId]);

    if (authMethod === 'token') {
      console.log(chalk.gray('\nCreate a Service Account Token in Grafana:'));
      console.log(chalk.gray('  Administration → Service Accounts → Create token\n'));

      const { token } = await inquirer.prompt([
        {
          type: 'password',
          name: 'token',
          message: 'Service Account Token:',
          mask: '*',
        },
      ]);

      if (token) {
        runConfig(binary, ['config', 'set', `contexts.${contextName}.grafana.token`, token]);
      }
    } else if (authMethod === 'basic') {
      const { username } = await inquirer.prompt([
        {
          type: 'input',
          name: 'username',
          message: 'Username:',
          default: 'admin',
        },
      ]);

      const { password } = await inquirer.prompt([
        {
          type: 'password',
          name: 'password',
          message: 'Password:',
          mask: '*',
        },
      ]);

      runConfig(binary, ['config', 'set', `contexts.${contextName}.grafana.user`, username]);
      runConfig(binary, ['config', 'set', `contexts.${contextName}.grafana.password`, password]);
    }

    // Set as current context if it's the first one
    runConfig(binary, ['config', 'use-context', contextName]);

    console.log(chalk.green(`\n✓ Context '${contextName}' configured`));

    // Verify connection for this specific context
    console.log(chalk.blue('\nVerifying connection...'));
    const checkResult = spawnSync(binary, ['config', 'check', '--context', contextName], {
      stdio: 'inherit',
    });
    if (checkResult.status === 0) {
      console.log(chalk.green('✓ Connection verified'));
    } else {
      console.log(chalk.yellow('! Could not verify connection (check credentials)'));
    }

    return true;
  } catch (error) {
    console.error(chalk.red(`\n✗ Configuration failed: ${error.message}`));
    return false;
  }
};

/**
 * Configure Grafana CLI
 */
export const configureGrafanaCli = async () => {
  console.log(chalk.cyan('\n=== Grafana CLI Configuration ===\n'));
  console.log(chalk.gray('grafanactl requires Grafana 12+ and is in public preview.\n'));

  // Check installation
  let binary = findGrafanactlBinary();

  if (!binary) {
    console.log(chalk.yellow('! Grafana CLI (grafanactl) is not installed'));

    const { install } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'install',
        message: 'Install grafanactl?',
        default: true,
      },
    ]);

    if (install) {
      const result = await installGrafanactl();
      if (!result.success) {
        return false;
      }
      binary = result.binaryPath || findGrafanactlBinary();
      if (!binary) {
        console.log(chalk.red('✗ Could not find grafanactl after installation'));
        return false;
      }
    } else {
      console.log(chalk.gray('Skipping Grafana CLI setup.'));
      return false;
    }
  } else {
    console.log(chalk.green('✓ Grafana CLI is installed'));

    // Show path if not in PATH
    if (!commandExists('grafanactl')) {
      console.log(chalk.yellow(`  Location: ${binary}`));
      console.log(chalk.yellow('  Note: Not in PATH. Add to your shell profile:'));
      console.log(chalk.gray(`    export PATH="$PATH:${path.dirname(binary)}"`));
    }

    // Check version
    try {
      const version = execSync(`${binary} --version`, { encoding: 'utf8' }).trim();
      console.log(chalk.gray(`  Version: ${version}`));
    } catch {
      // Version check failed, continue anyway
    }
  }

  // Check configuration
  const currentContext = getCurrentContext();

  if (currentContext) {
    console.log(chalk.green(`✓ Active context: ${chalk.white(currentContext)}`));

    // List all contexts
    let contexts = [];
    try {
      const output = execSync(`${binary} config list-contexts`, {
        encoding: 'utf8',
        stdio: 'pipe',
      });
      contexts = output
        .split('\n')
        .map((line) => line.replace(/^\*?\s*/, '').trim())
        .filter(Boolean);
    } catch {
      // Ignore errors
    }

    const { action } = await inquirer.prompt([
      {
        type: 'select',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: 'Add another context', value: 'add' },
          { name: 'Remove a context', value: 'remove' },
          { name: 'View current configuration', value: 'view' },
          { name: 'Done', value: 'done' },
        ],
      },
    ]);

    if (action === 'add') {
      await configureContext(binary);
    } else if (action === 'remove') {
      if (contexts.length === 0) {
        console.log(chalk.yellow('No contexts to remove.'));
      } else {
        const { contextToRemove } = await inquirer.prompt([
          {
            type: 'select',
            name: 'contextToRemove',
            message: 'Select context to remove:',
            choices: contexts.map((ctx) => ({
              name: ctx === currentContext ? `${ctx} (current)` : ctx,
              value: ctx,
            })),
          },
        ]);

        try {
          runConfig(binary, ['config', 'unset', `contexts.${contextToRemove}`]);
          console.log(chalk.green(`✓ Context '${contextToRemove}' removed`));

          // If we removed the current context, switch to another if available
          if (contextToRemove === currentContext) {
            const remaining = contexts.filter((c) => c !== contextToRemove);
            if (remaining.length > 0) {
              runConfig(binary, ['config', 'use-context', remaining[0]]);
              console.log(chalk.gray(`  Switched to context '${remaining[0]}'`));
            }
          }
        } catch (error) {
          console.log(chalk.red(`✗ Failed to remove context: ${error.message}`));
        }
      }
    } else if (action === 'view') {
      console.log();
      execSync(`${binary} config view`, { stdio: 'inherit' });
    }
  } else {
    // No contexts configured
    const { configure } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'configure',
        message: 'Set up a Grafana context now?',
        default: true,
      },
    ]);

    if (configure) {
      await configureContext(binary);
    } else {
      console.log(chalk.gray('\nSkipping context setup.'));
      console.log(
        chalk.gray(
          `Configure later with: ${binary} config set contexts.<name>.grafana.server <url>`
        )
      );
    }
  }

  console.log(chalk.green('\n✓ Grafana CLI configuration complete'));
  return true;
};
