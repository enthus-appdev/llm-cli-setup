import chalk from 'chalk';
import inquirer from 'inquirer';
import { execSync } from 'child_process';
import { commandExists } from '../utils/platform.js';
import { isGhAuthenticated } from './gh.js';

// Repository for atl-cli (will be public)
const ATL_CLI_REPO = 'enthus-appdev/atl-cli';

/**
 * Check if atl-cli is installed
 */
export const isAtlInstalled = () => commandExists('atl');

/**
 * Check if atl-cli is authenticated
 */
export const isAtlAuthenticated = () => {
  try {
    execSync('atl auth status', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
};

/**
 * Install atl-cli
 */
const installAtl = async () => {
  const platform = process.platform;

  if (platform !== 'darwin' && platform !== 'linux') {
    console.log(chalk.yellow('atl-cli installation is only supported on macOS and Linux.'));
    console.log(chalk.gray(`Please install manually from: https://github.com/${ATL_CLI_REPO}`));
    return false;
  }

  // Check if gh is authenticated (needed for private repo, optional for public)
  if (!isGhAuthenticated()) {
    console.log(chalk.yellow('GitHub CLI not authenticated.'));
    console.log(chalk.gray('Please authenticate first: gh auth login'));
    return false;
  }

  console.log(chalk.blue('Installing atl-cli...'));
  console.log(chalk.gray('Fetching install script from GitHub...'));

  try {
    // Use gh api to fetch install script (works for both public and private repos)
    execSync(`gh api repos/${ATL_CLI_REPO}/contents/install.sh -q '.content' | base64 -d | bash`, {
      stdio: 'inherit',
      shell: true,
    });

    // Verify installation
    if (!commandExists('atl')) {
      console.error(chalk.red('✗ Install completed but atl command not found'));
      console.log(chalk.gray('Check ~/go/bin, ~/.local/bin, or /usr/local/bin'));
      return false;
    }

    console.log(chalk.green('✓ atl-cli installed successfully'));
    return true;
  } catch (error) {
    console.error(chalk.red(`✗ Failed to install: ${error.message}`));
    console.log(chalk.gray('Manual installation:'));
    console.log(chalk.gray(`  git clone git@github.com:${ATL_CLI_REPO}.git`));
    console.log(chalk.gray('  cd atl-cli && make install'));
    return false;
  }
};

/**
 * Configure Atlassian CLI
 */
export const configureAtlassianCli = async () => {
  console.log(chalk.cyan('\n=== Atlassian CLI Configuration ===\n'));

  // Check installation
  if (!isAtlInstalled()) {
    console.log(chalk.yellow('! Atlassian CLI (atl) is not installed'));

    const { install } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'install',
        message: 'Install atl-cli?',
        default: true,
      },
    ]);

    if (install) {
      const success = await installAtl();
      if (!success) return false;
    } else {
      console.log(chalk.gray('Skipping Atlassian CLI setup.'));
      return false;
    }
  } else {
    console.log(chalk.green('✓ Atlassian CLI is installed'));

    const { reinstall } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'reinstall',
        message: 'Reinstall atl-cli?',
        default: false,
      },
    ]);

    if (reinstall) await installAtl();
  }

  // Check authentication
  if (isAtlAuthenticated()) {
    console.log(chalk.green('✓ Already authenticated with Atlassian'));

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

  // OAuth setup
  console.log(chalk.blue('\nStarting Atlassian OAuth setup...'));
  console.log(chalk.gray('This will guide you through creating an OAuth app.\n'));

  const { runSetup } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'runSetup',
      message: 'Run OAuth setup wizard? (Required for first-time setup)',
      default: !isAtlAuthenticated(),
    },
  ]);

  if (runSetup) {
    try {
      execSync('atl auth setup', { stdio: 'inherit' });
      console.log(chalk.green('\n✓ OAuth setup completed'));
    } catch (error) {
      console.error(chalk.red(`\n✗ OAuth setup failed: ${error.message}`));
      console.log(chalk.gray('Try again with: atl auth setup'));
      return false;
    }
  } else if (!isAtlAuthenticated()) {
    console.log(chalk.yellow('\nSkipping (OAuth setup required first).'));
    console.log(chalk.gray('Run: atl auth setup'));
    return false;
  }

  // Authenticate
  console.log(chalk.blue('\nStarting Atlassian authentication...'));
  console.log(chalk.gray('This will open a browser window.\n'));

  try {
    execSync('atl auth login', { stdio: 'inherit' });
    console.log(chalk.green('\n✓ Atlassian CLI authenticated successfully'));
    return true;
  } catch (error) {
    console.error(chalk.red(`\n✗ Authentication failed: ${error.message}`));
    console.log(chalk.gray('Try again with: atl auth login'));
    return false;
  }
};
