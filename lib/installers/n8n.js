import chalk from 'chalk';
import inquirer from 'inquirer';
import { execSync } from 'child_process';
import { commandExists } from '../utils/platform.js';
import { isGhAuthenticated } from './gh.js';

// Repository for n8n-cli - can be overridden via environment variable
export const N8N_CLI_REPO = process.env.N8N_CLI_REPO || 'enthus-appdev/n8n-cli';

/**
 * Check if n8n-cli is installed
 */
export const isN8nInstalled = () => commandExists('n8n');

/**
 * Check if n8n-cli is configured (has at least one instance)
 */
export const isN8nConfigured = () => {
  try {
    const output = execSync('n8n config list --json', { stdio: 'pipe' }).toString();
    const instances = JSON.parse(output);
    return instances && instances.length > 0;
  } catch {
    return false;
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

    // Verify installation
    if (!commandExists('n8n')) {
      console.error(chalk.red('✗ Install completed but n8n command not found'));
      console.log(chalk.gray('Check ~/go/bin, ~/.local/bin, or /usr/local/bin'));
      return false;
    }

    console.log(chalk.green('✓ n8n-cli installed successfully'));
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
  if (isN8nConfigured()) {
    console.log(chalk.green('✓ n8n CLI is configured with at least one instance'));

    const { reconfigure } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'reconfigure',
        message: 'Add or reconfigure an n8n instance?',
        default: false,
      },
    ]);

    if (!reconfigure) return true;
  }

  // Run interactive config
  console.log(chalk.blue('\nStarting n8n instance configuration...'));
  console.log(chalk.gray('You will need your n8n instance URL and API key.\n'));

  const { runSetup } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'runSetup',
      message: 'Run n8n config wizard?',
      default: !isN8nConfigured(),
    },
  ]);

  if (runSetup) {
    try {
      execSync('n8n config init', { stdio: 'inherit' });
      console.log(chalk.green('\n✓ n8n instance configured'));
      return true;
    } catch (error) {
      console.error(chalk.red(`\n✗ Configuration failed: ${error.message}`));
      console.log(chalk.gray('Try again with: n8n config init'));
      return false;
    }
  } else if (!isN8nConfigured()) {
    console.log(chalk.yellow('\nSkipping (at least one instance required for n8n-cli to work).'));
    console.log(chalk.gray('Run: n8n config init'));
    return false;
  }

  return true;
};
