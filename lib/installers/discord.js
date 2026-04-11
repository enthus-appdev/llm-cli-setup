import chalk from 'chalk';
import inquirer from 'inquirer';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { commandExists } from '../utils/platform.js';

const CONFIG_FILE = path.join(os.homedir(), '.config', 'discordctl', 'config.json');

// Repository for discordctl - can be overridden via environment variable
const rawRepo = process.env.DISCORD_CLI_REPO || 'enthus-appdev/discordctl';
export const DISCORD_CLI_REPO = /^[\w.-]+\/[\w.-]+$/.test(rawRepo)
  ? rawRepo
  : 'enthus-appdev/discordctl';

/**
 * Check if discordctl binary exists (in PATH or common locations)
 */
const findDiscordctlBinary = () => {
  if (commandExists('discordctl')) {
    return 'discordctl';
  }

  const locations = [
    path.join(os.homedir(), 'go', 'bin', 'discordctl'),
    path.join(os.homedir(), 'bin', 'discordctl'),
    path.join(os.homedir(), '.local', 'bin', 'discordctl'),
    '/usr/local/bin/discordctl',
  ];

  for (const loc of locations) {
    if (fs.existsSync(loc)) {
      return loc;
    }
  }

  return null;
};

/**
 * Check if discordctl is installed
 */
export const isDiscordctlInstalled = () => findDiscordctlBinary() !== null;

/**
 * Check if discordctl is configured (has token + guild)
 */
export const isDiscordctlConfigured = () => {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    return !!(config.token && config.guildId);
  } catch {
    return false;
  }
};

/**
 * Get configured display name
 */
export const getDisplayName = () => {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    return config.displayName || null;
  } catch {
    return null;
  }
};

/**
 * Configure git and Go for private repo access
 */
const configurePrivateRepoAccess = () => {
  const repoOrg = DISCORD_CLI_REPO.split('/')[0];
  const goprivate = `github.com/${repoOrg}/*`;
  process.env.GOPRIVATE = goprivate;

  const gitResult = spawnSync(
    'git',
    ['config', '--global', '--get', 'url.git@github.com:.insteadOf'],
    {
      encoding: 'utf8',
      stdio: 'pipe',
    }
  );

  const needsConfig = gitResult.status !== 0 || gitResult.stdout.trim() !== 'https://github.com/';

  if (needsConfig) {
    console.log(chalk.gray('Configuring git to use SSH for GitHub...'));
    const setResult = spawnSync(
      'git',
      ['config', '--global', 'url.git@github.com:.insteadOf', 'https://github.com/'],
      {
        stdio: 'pipe',
      }
    );
    if (setResult.status !== 0) {
      console.log(chalk.yellow('Could not configure git SSH rewrite'));
    }
  }

  return goprivate;
};

/**
 * Install discordctl via go install
 */
export const installDiscordctl = async () => {
  const platform = process.platform;

  if (platform !== 'darwin' && platform !== 'linux') {
    console.log(chalk.yellow('discordctl installation is only supported on macOS and Linux.'));
    console.log(chalk.gray(`Please install manually from: https://github.com/${DISCORD_CLI_REPO}`));
    return false;
  }

  if (!commandExists('go')) {
    console.log(chalk.yellow('Go is required but not installed.'));
    console.log(chalk.gray('Install Go from: https://go.dev/dl/'));
    return false;
  }

  console.log(chalk.blue('Installing discordctl via go install...'));

  const goprivate = configurePrivateRepoAccess();
  console.log(chalk.gray(`GOPRIVATE=${goprivate}`));

  try {
    const result = spawnSync(
      'go',
      ['install', `github.com/${DISCORD_CLI_REPO}/cmd/discordctl@latest`],
      {
        stdio: 'inherit',
        env: { ...process.env, GOPRIVATE: goprivate },
      }
    );
    if (result.status !== 0) throw new Error(`Install failed with exit code ${result.status}`);

    const binaryPath = findDiscordctlBinary();
    if (!binaryPath) {
      console.error(chalk.red('✗ Install completed but discordctl not found'));
      console.log(chalk.gray('Check ~/go/bin or ensure GOPATH/bin is in your PATH'));
      return false;
    }

    console.log(chalk.green('✓ discordctl installed successfully'));

    if (!commandExists('discordctl')) {
      console.log(chalk.yellow(`\n⚠ discordctl installed to ${binaryPath}`));
      console.log(chalk.yellow("But it's not in your PATH. Add it with:"));
      console.log(chalk.gray(`  export PATH="$PATH:${path.dirname(binaryPath)}"`));
    }

    return true;
  } catch (error) {
    console.error(chalk.red(`✗ Failed to install: ${error.message}`));
    console.log(chalk.gray('Manual installation:'));
    console.log(chalk.gray(`  git clone git@github.com:${DISCORD_CLI_REPO}.git`));
    console.log(chalk.gray('  cd discordctl && go install ./cmd/discordctl'));
    return false;
  }
};

/**
 * Configure discordctl
 */
export const configureDiscordCli = async () => {
  console.log(chalk.cyan('\n=== Discord CLI Configuration ===\n'));

  let binary = findDiscordctlBinary();

  if (!binary) {
    console.log(chalk.yellow('! discordctl is not installed'));

    const { install } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'install',
        message: 'Install discordctl?',
        default: true,
      },
    ]);

    if (install) {
      const success = await installDiscordctl();
      if (!success) return false;
      binary = findDiscordctlBinary();
    } else {
      console.log(chalk.gray('Skipping discordctl setup.'));
      return false;
    }
  } else {
    console.log(chalk.green('✓ discordctl is installed'));

    if (!commandExists('discordctl')) {
      console.log(chalk.yellow(`  Location: ${binary}`));
      console.log(chalk.yellow('  Note: Not in PATH. Add to your shell profile:'));
      console.log(chalk.gray(`    export PATH="$PATH:${path.dirname(binary)}"`));
    }

    const { reinstall } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'reinstall',
        message: 'Reinstall discordctl?',
        default: false,
      },
    ]);

    if (reinstall) {
      await installDiscordctl();
      binary = findDiscordctlBinary();
    }
  }

  if (!binary) {
    console.log(chalk.red('✗ discordctl binary not found'));
    return false;
  }

  // Check configuration
  if (isDiscordctlConfigured()) {
    const name = getDisplayName();
    console.log(chalk.green(`✓ Configured${name ? ` (${name})` : ''}`));

    const { action } = await inquirer.prompt([
      {
        type: 'select',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: 'Reconfigure', value: 'reconfig' },
          { name: 'Done', value: 'done' },
        ],
      },
    ]);

    if (action === 'done') {
      console.log(chalk.green('\n✓ discordctl configuration complete'));
      return true;
    }
  }

  // Run interactive config
  const result = spawnSync(binary, ['config', 'init'], { stdio: 'inherit' });
  if (result.status !== 0) {
    console.log(chalk.yellow('\nConfiguration cancelled or failed'));
    console.log(chalk.gray('Configure later with: discordctl config init'));
    return false;
  }
  console.log(chalk.green('\n✓ discordctl configured'));

  console.log(chalk.green('\n✓ discordctl configuration complete'));
  return true;
};
