import chalk from 'chalk';
import inquirer from 'inquirer';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import { commandExists } from '../utils/platform.js';

/**
 * Check if n8nctl binary exists (in PATH or common locations)
 */
const findN8nctlBinary = () => {
  // First check if it's in PATH
  if (commandExists('n8nctl')) {
    return 'n8nctl';
  }

  // Check common installation locations
  const locations = [
    path.join(os.homedir(), 'go', 'bin', 'n8nctl'),
    path.join(os.homedir(), '.local', 'bin', 'n8nctl'),
    '/usr/local/bin/n8nctl',
  ];

  for (const loc of locations) {
    if (fs.existsSync(loc)) {
      return loc;
    }
  }

  return null;
};

// Repository for n8n-cli - can be overridden via environment variable
export const N8N_CLI_REPO = process.env.N8N_CLI_REPO || 'enthus-appdev/n8n-cli';

/**
 * Check if n8n-cli is installed
 */
export const isN8nInstalled = () => findN8nctlBinary() !== null;

/**
 * Check if n8n-cli is configured (has at least one instance)
 */
export const isN8nConfigured = () => {
  const binary = findN8nctlBinary();
  if (!binary) return false;

  try {
    const output = execSync(`${binary} config list`, { stdio: 'pipe', encoding: 'utf8' });
    // If output contains instance info (not just headers/empty), it's configured
    // Look for typical instance indicators like URLs or names
    return output.includes('http') || output.includes('Active');
  } catch {
    return false;
  }
};

/**
 * Get current/active n8n instance name
 */
export const getCurrentInstance = () => {
  const binary = findN8nctlBinary();
  if (!binary) return null;

  try {
    const output = execSync(`${binary} config list`, { stdio: 'pipe', encoding: 'utf8' });
    // Look for line with * (active instance)
    const lines = output.split('\n');
    for (const line of lines) {
      if (line.includes('*')) {
        // Extract instance name (typically first column after *)
        const match = line.match(/\*\s*(\S+)/);
        if (match) return match[1];
      }
    }
    return null;
  } catch {
    return null;
  }
};

/**
 * Configure git and Go for private repo access
 */
const configurePrivateRepoAccess = () => {
  const repoOrg = N8N_CLI_REPO.split('/')[0];

  // Set GOPRIVATE for the organization
  const goprivate = `github.com/${repoOrg}/*`;
  process.env.GOPRIVATE = goprivate;

  // Check if git is configured to use SSH for GitHub
  try {
    const gitConfig = execSync('git config --global --get url.git@github.com:.insteadOf', {
      encoding: 'utf8',
      stdio: 'pipe',
    }).trim();

    if (!gitConfig.includes('https://github.com/')) {
      console.log(chalk.gray('Configuring git to use SSH for GitHub...'));
      execSync('git config --global url."git@github.com:".insteadOf "https://github.com/"', {
        stdio: 'pipe',
      });
    }
  } catch {
    // Config doesn't exist, set it
    console.log(chalk.gray('Configuring git to use SSH for GitHub...'));
    try {
      execSync('git config --global url."git@github.com:".insteadOf "https://github.com/"', {
        stdio: 'pipe',
      });
    } catch (error) {
      console.log(chalk.yellow(`Could not configure git: ${error.message}`));
    }
  }

  return goprivate;
};

/**
 * Install n8n-cli via go install
 */
const installN8n = async () => {
  const platform = process.platform;

  if (platform !== 'darwin' && platform !== 'linux') {
    console.log(chalk.yellow('n8n-cli installation is only supported on macOS and Linux.'));
    console.log(chalk.gray(`Please install manually from: https://github.com/${N8N_CLI_REPO}`));
    return false;
  }

  // Check if Go is installed
  if (!commandExists('go')) {
    console.log(chalk.yellow('Go is required but not installed.'));
    console.log(chalk.gray('Install Go from: https://go.dev/dl/'));
    return false;
  }

  console.log(chalk.blue('Installing n8n-cli via go install...'));

  // Configure for private repo access
  const goprivate = configurePrivateRepoAccess();
  console.log(chalk.gray(`GOPRIVATE=${goprivate}`));

  try {
    const installCmd = `GOPRIVATE=${goprivate} go install github.com/${N8N_CLI_REPO}/cmd/n8nctl@latest`;
    execSync(installCmd, {
      stdio: 'inherit',
      shell: true,
    });

    // Find the installed binary
    const binaryPath = findN8nctlBinary();
    if (!binaryPath) {
      console.error(chalk.red('✗ Install completed but n8nctl not found'));
      console.log(chalk.gray('Check ~/go/bin or ensure GOPATH/bin is in your PATH'));
      return false;
    }

    console.log(chalk.green('✓ n8nctl installed successfully'));

    // Warn if not in PATH
    if (!commandExists('n8nctl')) {
      console.log(chalk.yellow(`\n⚠ n8nctl installed to ${binaryPath}`));
      console.log(chalk.yellow("But it's not in your PATH. Add it with:"));
      console.log(chalk.gray(`  export PATH="$PATH:${path.dirname(binaryPath)}"`));
    }

    return true;
  } catch (error) {
    console.error(chalk.red(`✗ Failed to install: ${error.message}`));
    console.log(chalk.gray('Manual installation:'));
    console.log(chalk.gray(`  git clone git@github.com:${N8N_CLI_REPO}.git`));
    console.log(chalk.gray('  cd n8n-cli && make install'));
    return false;
  }
};

/**
 * Configure n8n CLI
 */
export const configureN8nCli = async () => {
  console.log(chalk.cyan('\n=== n8n CLI Configuration ===\n'));

  let binary = findN8nctlBinary();

  // Check installation
  if (!binary) {
    console.log(chalk.yellow('! n8n CLI is not installed'));

    const { install } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'install',
        message: 'Install n8n-cli?',
        default: true,
      },
    ]);

    if (install) {
      const success = await installN8n();
      if (!success) return false;
      binary = findN8nctlBinary();
    } else {
      console.log(chalk.gray('Skipping n8n CLI setup.'));
      return false;
    }
  } else {
    console.log(chalk.green('✓ n8n CLI is installed'));

    // Show path if not in PATH
    if (!commandExists('n8nctl')) {
      console.log(chalk.yellow(`  Location: ${binary}`));
      console.log(chalk.yellow('  Note: Not in PATH. Add to your shell profile:'));
      console.log(chalk.gray(`    export PATH="$PATH:${path.dirname(binary)}"`));
    }

    const { reinstall } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'reinstall',
        message: 'Reinstall n8n-cli?',
        default: false,
      },
    ]);

    if (reinstall) {
      await installN8n();
      binary = findN8nctlBinary();
    }
  }

  if (!binary) {
    console.log(chalk.red('✗ n8nctl binary not found'));
    return false;
  }

  // Check configuration
  const currentInstance = getCurrentInstance();

  if (currentInstance) {
    console.log(chalk.green(`✓ Active instance: ${chalk.white(currentInstance)}`));

    const { action } = await inquirer.prompt([
      {
        type: 'select',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: 'Add another instance', value: 'add' },
          { name: 'View current configuration', value: 'view' },
          { name: 'Done', value: 'done' },
        ],
      },
    ]);

    if (action === 'add') {
      try {
        execSync(`${binary} config init`, { stdio: 'inherit' });
      } catch {
        console.log(chalk.yellow('Configuration cancelled or failed'));
      }
    } else if (action === 'view') {
      console.log();
      execSync(`${binary} config list`, { stdio: 'inherit' });
    }
  } else {
    // No instances configured
    const { configure } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'configure',
        message: 'Set up an n8n instance now?',
        default: true,
      },
    ]);

    if (configure) {
      try {
        execSync(`${binary} config init`, { stdio: 'inherit' });
        console.log(chalk.green('\n✓ n8n instance configured'));
      } catch {
        console.log(chalk.yellow('\nConfiguration cancelled or failed'));
        console.log(chalk.gray(`Configure later with: ${binary} config init`));
      }
    } else {
      console.log(chalk.gray('\nSkipping instance setup.'));
      console.log(chalk.gray(`Configure later with: ${binary} config init`));
    }
  }

  console.log(chalk.green('\n✓ n8n CLI configuration complete'));
  return true;
};
