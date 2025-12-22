import chalk from 'chalk';
import inquirer from 'inquirer';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import { commandExists } from '../utils/platform.js';
import { isGhAuthenticated } from './gh.js';

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
 * Install n8n-cli
 */
const installN8n = async () => {
  const platform = process.platform;

  if (platform !== 'darwin' && platform !== 'linux') {
    console.log(chalk.yellow('n8n-cli installation is only supported on macOS and Linux.'));
    console.log(chalk.gray(`Please install manually from: https://github.com/${N8N_CLI_REPO}`));
    return false;
  }

  // Check if gh is authenticated (needed for private repo, optional for public)
  if (!isGhAuthenticated()) {
    console.log(chalk.yellow('GitHub CLI not authenticated.'));
    console.log(chalk.gray('Please authenticate first: gh auth login'));
    return false;
  }

  console.log(chalk.blue('Installing n8n-cli...'));
  console.log(chalk.gray('Fetching install script from GitHub...'));

  try {
    // Use gh api to fetch install script (works for both public and private repos)
    execSync(`gh api repos/${N8N_CLI_REPO}/contents/install.sh -q '.content' | base64 -d | bash`, {
      stdio: 'inherit',
      shell: true,
    });

    // Verify installation (check PATH and common locations)
    const binaryPath = findN8nctlBinary();
    if (!binaryPath) {
      console.error(chalk.red('✗ Install completed but n8nctl not found'));
      console.log(chalk.gray('Check ~/go/bin, ~/.local/bin, or /usr/local/bin'));
      return false;
    }

    if (!commandExists('n8nctl')) {
      console.log(chalk.yellow(`\n⚠ n8nctl installed to ${binaryPath}`));
      console.log(chalk.yellow('But it\'s not in your PATH. Add it with:'));
      console.log(chalk.gray(`  export PATH="$PATH:${path.dirname(binaryPath)}"`));
    }

    console.log(chalk.green('✓ n8nctl installed successfully'));
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

  // Check installation
  if (!isN8nInstalled()) {
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
    } else {
      console.log(chalk.gray('Skipping n8n CLI setup.'));
      return false;
    }
  } else {
    console.log(chalk.green('✓ n8n CLI is installed'));

    const { reinstall } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'reinstall',
        message: 'Reinstall n8n-cli?',
        default: false,
      },
    ]);

    if (reinstall) await installN8n();
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
      const binary = findN8nctlBinary();
      try {
        execSync(`${binary} config init`, { stdio: 'inherit' });
        console.log(chalk.green('\n✓ n8n instance configured'));
      } catch (error) {
        console.error(chalk.red(`\n✗ Configuration failed: ${error.message}`));
      }
    } else if (action === 'view') {
      const binary = findN8nctlBinary();
      console.log();
      execSync(`${binary} config list`, { stdio: 'inherit' });
    }

    console.log(chalk.green('\n✓ n8n CLI configuration complete'));
    return true;
  }

  // No instances configured - prompt to set up
  console.log(chalk.yellow('! No n8n instances configured'));

  const { runSetup } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'runSetup',
      message: 'Set up an n8n instance now?',
      default: true,
    },
  ]);

  if (runSetup) {
    const binary = findN8nctlBinary();
    if (!binary) {
      console.error(chalk.red('\n✗ n8nctl not found'));
      return false;
    }

    console.log(chalk.gray('\nYou will need your n8n instance URL and API key.\n'));

    try {
      execSync(`${binary} config init`, { stdio: 'inherit' });
      console.log(chalk.green('\n✓ n8n instance configured'));
      return true;
    } catch (error) {
      console.error(chalk.red(`\n✗ Configuration failed: ${error.message}`));
      console.log(chalk.gray('Try again with: n8nctl config init'));
      return false;
    }
  } else {
    console.log(chalk.gray('\nSkipping instance setup.'));
    console.log(chalk.gray('Configure later with: n8nctl config init'));
  }

  console.log(chalk.green('\n✓ n8n CLI configuration complete'));
  return true;
};
