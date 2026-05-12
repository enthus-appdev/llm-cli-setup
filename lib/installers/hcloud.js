import chalk from 'chalk';
import inquirer from 'inquirer';
import { execSync } from 'child_process';
import { commandExists, detectPackageManager, installPackage } from '../utils/platform.js';

/**
 * Check if hcloud CLI is installed
 */
export const isHcloudInstalled = () => commandExists('hcloud');

/**
 * Check if hcloud has an active context configured
 */
export const isHcloudConfigured = () => {
  try {
    const output = execSync('hcloud context active', { stdio: 'pipe', encoding: 'utf8' }).trim();
    return output.length > 0;
  } catch {
    return false;
  }
};

/**
 * Get the active hcloud context name
 */
export const getActiveContext = () => {
  try {
    const output = execSync('hcloud context active', { stdio: 'pipe', encoding: 'utf8' }).trim();
    return output || null;
  } catch {
    return null;
  }
};

/**
 * Install hcloud CLI
 */
const installHcloud = async () => {
  const pkgManager = detectPackageManager();
  if (!pkgManager) {
    console.log(chalk.gray('No supported package manager found.'));
    console.log(chalk.gray('Install manually: https://github.com/hetznercloud/cli#installation'));
    return false;
  }

  const { install } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'install',
      message: `Install Hetzner Cloud CLI using ${pkgManager.name}?`,
      default: true,
    },
  ]);

  if (!install) {
    console.log(chalk.gray('Skipping Hetzner Cloud CLI installation.'));
    return false;
  }

  console.log(chalk.blue('Installing Hetzner Cloud CLI...'));
  try {
    await installPackage('hcloud', pkgManager, 'hcloud');
    console.log(chalk.green('✓ Hetzner Cloud CLI installed successfully'));
    return true;
  } catch (error) {
    console.error(chalk.red(`✗ Failed to install: ${error.message}`));
    console.log(chalk.gray('Install manually: https://github.com/hetznercloud/cli#installation'));
    return false;
  }
};

/**
 * Create a new hcloud context (prompts for API token interactively)
 */
const createContext = async () => {
  const { name } = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Context name (e.g. enthus):',
      default: 'default',
      validate: (value) => (value.trim().length > 0 ? true : 'Name cannot be empty'),
    },
  ]);

  console.log(chalk.gray('\nGet an API token at: https://console.hetzner.cloud/'));
  console.log(chalk.gray('  Project → Security → API Tokens → Generate API Token\n'));

  try {
    execSync(`hcloud context create ${name}`, { stdio: 'inherit' });
    console.log(chalk.green(`\n✓ Context "${name}" created and activated`));
    return true;
  } catch {
    console.log(chalk.yellow('\nContext creation cancelled or failed'));
    console.log(chalk.gray('Create later with: hcloud context create <name>'));
    return false;
  }
};

/**
 * Configure Hetzner Cloud CLI
 */
export const configureHcloudCli = async () => {
  console.log(chalk.cyan('\n=== Hetzner Cloud CLI Configuration ===\n'));
  console.log(
    chalk.gray('CLI for managing Hetzner Cloud resources (servers, networks, volumes).\n')
  );

  // Check installation
  if (!isHcloudInstalled()) {
    console.log(chalk.yellow('! Hetzner Cloud CLI (hcloud) is not installed'));
    const installed = await installHcloud();
    if (!installed) return false;
  } else {
    console.log(chalk.green('✓ Hetzner Cloud CLI is installed'));
  }

  // Check configuration
  const active = getActiveContext();

  if (active) {
    console.log(chalk.green(`✓ Active context: ${chalk.white(active)}`));

    const { action } = await inquirer.prompt([
      {
        type: 'select',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: 'Add another context', value: 'add' },
          { name: 'View configured contexts', value: 'view' },
          { name: 'Done', value: 'done' },
        ],
      },
    ]);

    if (action === 'add') {
      await createContext();
    } else if (action === 'view') {
      console.log();
      try {
        execSync('hcloud context list', { stdio: 'inherit' });
      } catch {
        // ignore — display only
      }
    }
  } else {
    const { configure } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'configure',
        message: 'Create a Hetzner Cloud context now?',
        default: true,
      },
    ]);

    if (configure) {
      await createContext();
    } else {
      console.log(chalk.gray('\nSkipping context setup.'));
      console.log(chalk.gray('Create later with: hcloud context create <name>'));
    }
  }

  console.log(chalk.green('\n✓ Hetzner Cloud CLI configuration complete'));
  return true;
};
