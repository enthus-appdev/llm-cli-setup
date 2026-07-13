import chalk from 'chalk';
import inquirer from 'inquirer';
import os from 'os';
import path from 'path';
import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { commandExists } from '../utils/platform.js';

const INSTALL_SCRIPT_URL = 'https://raw.githubusercontent.com/ovh/ovhcloud-cli/main/install.sh';

// OVH_CONFIG overrides the default ~/.ovh.conf location (per upstream docs)
const configPath = () => process.env.OVH_CONFIG || path.join(os.homedir(), '.ovh.conf');

// A complete OVH_* env credential pair: OAuth2 client, or legacy app/consumer keys.
const hasEnvCredentials = () => {
  const env = process.env;
  const oauth2 = env.OVH_CLIENT_ID && env.OVH_CLIENT_SECRET;
  const legacy = env.OVH_APPLICATION_KEY && env.OVH_APPLICATION_SECRET && env.OVH_CONSUMER_KEY;
  return Boolean(oauth2 || legacy);
};

/**
 * Check if the ovhcloud CLI is installed
 */
export const isOvhcloudInstalled = () => commandExists('ovhcloud');

/**
 * Check if ovhcloud has credentials configured: a complete OVH_* env credential
 * pair, or a config file that actually carries a credential key (not just an
 * endpoint/empty file).
 */
export const isOvhcloudConfigured = () => {
  if (hasEnvCredentials()) return true;
  try {
    const content = readFileSync(configPath(), 'utf8');
    const has = (key) => new RegExp(`^\\s*${key}\\s*=\\s*\\S`, 'm').test(content);
    const oauth2 = has('client_id') && has('client_secret');
    const legacy = has('application_key') && has('application_secret') && has('consumer_key');
    return oauth2 || legacy;
  } catch {
    return false;
  }
};

/**
 * Active endpoint (e.g. "ovh-eu"), or null. OVH_ENDPOINT overrides the config's
 * [default] section, matching the CLI's env-over-file precedence.
 */
export const getOvhcloudEndpoint = () => {
  if (process.env.OVH_ENDPOINT) return process.env.OVH_ENDPOINT;
  try {
    let inDefault = false;
    for (const raw of readFileSync(configPath(), 'utf8').split('\n')) {
      const line = raw.trim();
      if (line.startsWith('[')) {
        inDefault = line === '[default]';
        continue;
      }
      const match = inDefault && line.match(/^endpoint\s*=\s*(.+)$/);
      if (match) return match[1].split(/[;#]/)[0].trim(); // drop INI inline comment
    }
  } catch {
    // no readable config
  }
  return null;
};

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

  if (!useBrew) {
    // curl|sh runs upstream's official installer — show the URL for informed consent
    console.log(chalk.gray(`Install script: ${INSTALL_SCRIPT_URL}`));
  }
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
      // pipefail so a failed download (curl -f) propagates instead of sh's exit 0
      execSync(`set -o pipefail; curl -fsSL "${INSTALL_SCRIPT_URL}" | sh`, {
        stdio: 'inherit',
        shell: '/bin/bash',
      });
    }
    console.log(chalk.green('✓ OVHcloud CLI installed successfully'));
    if (!useBrew) {
      const binDir = process.env.XDG_BIN_HOME || path.join(os.homedir(), '.local', 'bin');
      console.log(chalk.gray(`Typically installed to ${binDir} — ensure it is on your PATH.`));
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
    // install.sh drops the binary into a dir this process's PATH snapshot may
    // not include — don't try to exec it (login) until it resolves.
    if (!isOvhcloudInstalled()) {
      console.log(chalk.yellow('\n⚠ ovhcloud is installed but not yet on this shell PATH.'));
      console.log(
        chalk.gray(
          'Restart your terminal (ensure its install dir is on PATH), then run: ovhcloud login'
        )
      );
      return true;
    }
  } else {
    console.log(chalk.green('✓ OVHcloud CLI is installed'));
  }

  if (isOvhcloudConfigured()) {
    const source = hasEnvCredentials() ? 'via OVH_* environment variables' : configPath();
    console.log(chalk.green(`✓ Credentials configured (${source})`));
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
