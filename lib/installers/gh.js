import chalk from 'chalk';
import inquirer from 'inquirer';
import { execSync } from 'child_process';
import { commandExists, detectPackageManager, installPackage } from '../utils/platform.js';

/**
 * Check if GitHub CLI is installed
 */
export const isGhInstalled = () => commandExists('gh');

/**
 * Check if GitHub CLI is authenticated
 */
export const isGhAuthenticated = () => {
  try {
    execSync('gh auth status', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
};

/**
 * Get current GitHub user
 */
export const getGhUser = () => {
  try {
    return execSync('gh api user --jq .login', { stdio: 'pipe', encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
};

/**
 * Install GitHub CLI
 */
const installGh = async () => {
  const pkgManager = detectPackageManager();
  if (!pkgManager) {
    console.log(chalk.gray('No supported package manager found.'));
    console.log(chalk.gray('Please install manually: https://cli.github.com/'));
    return false;
  }

  const { install } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'install',
      message: `Install GitHub CLI using ${pkgManager.name}?`,
      default: true,
    },
  ]);

  if (!install) {
    console.log(chalk.gray('Skipping GitHub CLI installation.'));
    return false;
  }

  console.log(chalk.blue('Installing GitHub CLI...'));
  try {
    await installPackage('gh', pkgManager, 'gh');
    console.log(chalk.green('✓ GitHub CLI installed successfully'));
    return true;
  } catch (error) {
    console.error(chalk.red(`✗ Failed to install: ${error.message}`));
    return false;
  }
};

/**
 * Configure GitHub CLI
 */
export const configureGitHubCli = async () => {
  console.log(chalk.cyan('\n=== GitHub CLI Configuration ===\n'));

  // Check installation
  if (!isGhInstalled()) {
    console.log(chalk.yellow('! GitHub CLI (gh) is not installed'));
    const installed = await installGh();
    if (!installed) return false;
  } else {
    console.log(chalk.green('✓ GitHub CLI is installed'));
  }

  // Check authentication
  if (isGhAuthenticated()) {
    const user = getGhUser();
    console.log(chalk.green(`✓ Authenticated as ${chalk.white(user)}`));

    const { reconfigure } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'reconfigure',
        message: 'Re-authenticate?',
        default: false,
      },
    ]);

    if (!reconfigure) return true;
  }

  // Authenticate
  console.log(chalk.blue('\nStarting GitHub authentication...'));
  console.log(chalk.gray('This will open a browser window.\n'));

  try {
    execSync('gh auth login --web --git-protocol https', { stdio: 'inherit' });
    console.log(chalk.green('\n✓ GitHub CLI authenticated successfully'));
    return true;
  } catch (error) {
    console.error(chalk.red(`\n✗ Authentication failed: ${error.message}`));
    console.log(chalk.gray('Try again later with: gh auth login'));
    return false;
  }
};
