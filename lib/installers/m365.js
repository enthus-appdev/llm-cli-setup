import chalk from 'chalk';
import inquirer from 'inquirer';
import { execSync } from 'child_process';
import { commandExists } from '../utils/platform.js';

/**
 * Check if Microsoft 365 CLI is installed
 */
export const isM365Installed = () => commandExists('m365');

/**
 * Check if Microsoft 365 CLI is authenticated
 */
export const isM365Authenticated = () => {
  try {
    const result = execSync('m365 status --output json', { stdio: 'pipe', encoding: 'utf8' });
    const status = JSON.parse(result);
    return status.logged === true;
  } catch {
    return false;
  }
};

/**
 * Get current M365 user
 */
export const getM365User = () => {
  try {
    const result = execSync('m365 status --output json', { stdio: 'pipe', encoding: 'utf8' });
    const status = JSON.parse(result);
    return status.connectedAs || null;
  } catch {
    return null;
  }
};

/**
 * Install Microsoft 365 CLI
 */
const installM365 = async () => {
  const { install } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'install',
      message: 'Install Microsoft 365 CLI using npm?',
      default: true,
    },
  ]);

  if (!install) {
    console.log(chalk.gray('Skipping Microsoft 365 CLI installation.'));
    return false;
  }

  console.log(chalk.blue('Installing Microsoft 365 CLI globally...'));
  try {
    execSync('npm install -g @pnp/cli-microsoft365', { stdio: 'inherit' });
    console.log(chalk.green('✓ Microsoft 365 CLI installed successfully'));
    return true;
  } catch (error) {
    console.error(chalk.red(`✗ Failed to install: ${error.message}`));
    return false;
  }
};

/**
 * Configure Microsoft 365 CLI
 */
export const configureM365Cli = async () => {
  console.log(chalk.cyan('\n=== Microsoft 365 CLI Configuration ===\n'));
  console.log(chalk.gray('PnP CLI for Microsoft 365 - SharePoint, Teams, OneDrive, and more.\n'));

  // Check installation
  if (!isM365Installed()) {
    console.log(chalk.yellow('! Microsoft 365 CLI (m365) is not installed'));
    const installed = await installM365();
    if (!installed) return false;
  } else {
    console.log(chalk.green('✓ Microsoft 365 CLI is installed'));
  }

  // Check authentication (getM365User returns null if not authenticated)
  const user = getM365User();
  if (user) {
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

  // Prompt for authentication
  const { authenticate } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'authenticate',
      message: 'Authenticate with Microsoft 365?',
      default: true,
    },
  ]);

  if (!authenticate) {
    console.log(chalk.gray('Skipping authentication.'));
    console.log(chalk.gray('Authenticate later with: m365 login'));
    return true;
  }

  // Ensure default appId is configured (required before login)
  try {
    execSync('m365 setup', { stdio: 'inherit' });
  } catch {
    console.error(chalk.red('✗ Failed to run m365 setup'));
    console.log(chalk.gray('Try running manually: m365 setup && m365 login'));
    return false;
  }

  // Authenticate
  console.log(chalk.blue('\nStarting Microsoft 365 authentication...'));
  console.log(chalk.gray('This will open a browser window for device code authentication.\n'));

  try {
    execSync('m365 login', { stdio: 'inherit' });
    console.log(chalk.green('\n✓ Microsoft 365 CLI authenticated successfully'));
    return true;
  } catch (error) {
    console.error(chalk.red(`\n✗ Authentication failed: ${error.message}`));
    console.log(chalk.gray('Try again later with: m365 login'));
    return false;
  }
};
