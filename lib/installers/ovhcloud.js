import chalk from 'chalk';
import inquirer from 'inquirer';
import os from 'os';
import path from 'path';
import { existsSync } from 'fs';
import { execSync } from 'child_process';
import { commandExists } from '../utils/platform.js';

const INSTALL_SCRIPT_URL = 'https://raw.githubusercontent.com/ovh/ovhcloud-cli/main/install.sh';
const CONFIG_FILE = path.join(os.homedir(), '.ovh.conf');

/**
 * Check if the ovhcloud CLI is installed
 */
export const isOvhcloudInstalled = () => commandExists('ovhcloud');

/**
 * Check if ovhcloud has credentials configured (~/.ovh.conf)
 */
export const isOvhcloudConfigured = () => existsSync(CONFIG_FILE);

/**
 * Install the ovhcloud CLI.
 * macOS with Homebrew uses the official cask; everything else uses the
 * upstream install.sh, which drops the binary into ~/.local/bin without sudo.
 */
const installOvhcloud = async () => {
  const isMacOS = os.platform() === 'darwin';
  const isWindows = os.platform() === 'win32';

  if (isWindows) {
    console.log(chalk.gray('Automated install is not supported on Windows.'));
    console.log(chalk.gray('Download from: https://github.com/ovh/ovhcloud-cli/releases/latest'));
    return false;
  }

  const useBrew = isMacOS && commandExists('brew');
  const method = useBrew ? 'Homebrew' : 'the official install script';

  const { install } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'install',
      message: `Install OVHcloud CLI using ${method}?`,
      default: true,
    },
  ]);

  if (!install) {
    console.log(chalk.gray('Skipping OVHcloud CLI installation.'));
    return false;
  }

  console.log(chalk.blue('Installing OVHcloud CLI...'));
  try {
    if (useBrew) {
      execSync('brew install --cask ovh/tap/ovhcloud-cli', { stdio: 'inherit' });
    } else {
      execSync(`curl -fsSL "${INSTALL_SCRIPT_URL}" | sh`, { stdio: 'inherit' });
    }
    console.log(chalk.green('✓ OVHcloud CLI installed successfully'));
    if (!useBrew) {
      const binDir = process.env.XDG_BIN_HOME || path.join(os.homedir(), '.local', 'bin');
      console.log(chalk.gray(`Installed to ${binDir} — ensure it is on your PATH.`));
    }
    return true;
  } catch (error) {
    console.error(chalk.red(`✗ Failed to install: ${error.message}`));
    console.log(chalk.gray('Install manually: https://github.com/ovh/ovhcloud-cli#installation'));
    return false;
  }
};

/**
 * Configure the OVHcloud CLI (install + interactive login)
 */
export const configureOvhcloudCli = async () => {
  console.log(chalk.cyan('\n=== OVHcloud CLI Configuration ===\n'));
  console.log(
    chalk.gray('CLI for managing OVHcloud services (VPS, dedicated servers, domains, etc.).\n')
  );

  if (!isOvhcloudInstalled()) {
    console.log(chalk.yellow('! OVHcloud CLI (ovhcloud) is not installed'));
    const installed = await installOvhcloud();
    if (!installed) return false;
  } else {
    console.log(chalk.green('✓ OVHcloud CLI is installed'));
  }

  if (isOvhcloudConfigured()) {
    console.log(chalk.green(`✓ Credentials configured (${CONFIG_FILE})`));
    const { relogin } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'relogin',
        message: 'Re-run "ovhcloud login" to refresh credentials?',
        default: false,
      },
    ]);
    if (!relogin) {
      console.log(chalk.green('\n✓ OVHcloud CLI configuration complete'));
      return true;
    }
  } else {
    const { login } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'login',
        message: 'Authenticate now with "ovhcloud login"?',
        default: true,
      },
    ]);
    if (!login) {
      console.log(chalk.gray('\nSkipping login. Authenticate later with: ovhcloud login'));
      return true;
    }
  }

  console.log(chalk.blue('\nRunning ovhcloud login...'));
  try {
    execSync('ovhcloud login', { stdio: 'inherit' });
    console.log(chalk.green('\n✓ OVHcloud CLI configuration complete'));
  } catch {
    console.log(chalk.yellow('\nLogin cancelled or failed'));
    console.log(chalk.gray('Authenticate later with: ovhcloud login'));
  }
  return true;
};
