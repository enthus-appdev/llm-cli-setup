import chalk from 'chalk';
import inquirer from 'inquirer';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import { commandExists } from '../utils/platform.js';

const CONFIG_FILE = path.join(os.homedir(), '.config', 'discordctl', 'config.json');
const REPO_DIR = path.join(os.homedir(), 'dev', 'discordctl');

/**
 * Check if discordctl is installed
 */
export const isDiscordctlInstalled = () => commandExists('discordctl');

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
 * Install discordctl via npm link from local repo
 */
const installDiscordctl = async () => {
  if (!fs.existsSync(REPO_DIR)) {
    console.log(chalk.yellow('discordctl repository not found at ~/dev/discordctl'));
    console.log(chalk.gray('Clone it first:'));
    console.log(
      chalk.gray('  git clone git@github.com:enthus-appdev/discordctl.git ~/dev/discordctl')
    );
    return false;
  }

  console.log(chalk.blue('Installing discordctl...'));

  try {
    execSync('npm install', { cwd: REPO_DIR, stdio: 'pipe' });
    execSync('npm link', { cwd: REPO_DIR, stdio: 'pipe' });
    console.log(chalk.green('✓ discordctl installed'));
    return true;
  } catch (error) {
    console.error(chalk.red(`✗ Failed to install: ${error.message}`));
    return false;
  }
};

/**
 * Configure discordctl
 */
export const configureDiscordCli = async () => {
  console.log(chalk.cyan('\n=== Discord CLI Configuration ===\n'));

  // Check installation
  if (!isDiscordctlInstalled()) {
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
    } else {
      console.log(chalk.gray('Skipping discordctl setup.'));
      return false;
    }
  } else {
    console.log(chalk.green('✓ discordctl is installed'));
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
  try {
    execSync('discordctl config init', { stdio: 'inherit' });
    console.log(chalk.green('\n✓ discordctl configured'));
  } catch {
    console.log(chalk.yellow('\nConfiguration cancelled or failed'));
    console.log(chalk.gray('Configure later with: discordctl config init'));
  }

  console.log(chalk.green('\n✓ discordctl configuration complete'));
  return true;
};
