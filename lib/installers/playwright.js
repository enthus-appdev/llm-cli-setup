import chalk from 'chalk';
import inquirer from 'inquirer';
import { execSync } from 'child_process';
import { unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { commandExists } from '../utils/platform.js';

/**
 * Check if Playwright is installed
 */
export const isPlaywrightInstalled = () => commandExists('playwright');

/**
 * Get Playwright version
 */
export const getPlaywrightVersion = () => {
  try {
    const result = execSync('npx playwright --version', { stdio: 'pipe', encoding: 'utf8' });
    return result.trim().replace('Version ', '');
  } catch {
    return null;
  }
};

/**
 * Check if Playwright browsers are installed
 */
export const isPlaywrightConfigured = () => {
  // Must use a .png path — Playwright infers format from extension and rejects /dev/null
  const tmpFile = join(tmpdir(), `.pw-check-${Math.random().toString(36).slice(2)}.png`);
  try {
    // Try a quick headless screenshot of about:blank to verify browsers work
    execSync(`npx playwright screenshot --timeout 5000 about:blank "${tmpFile}"`, {
      stdio: 'pipe',
      encoding: 'utf8',
      timeout: 15000,
    });
    return true;
  } catch {
    return false;
  } finally {
    try { unlinkSync(tmpFile); } catch {}
  }
};

/**
 * Install Playwright globally via npm
 */
const installPlaywright = async () => {
  const { install } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'install',
      message: 'Install Playwright using npm?',
      default: true,
    },
  ]);

  if (!install) {
    console.log(chalk.gray('Skipping Playwright installation.'));
    return false;
  }

  console.log(chalk.blue('Installing Playwright globally...'));
  try {
    execSync('npm install -g playwright', { stdio: 'inherit' });
    console.log(chalk.green('✓ Playwright installed successfully'));
    return true;
  } catch (error) {
    console.error(chalk.red(`✗ Failed to install: ${error.message}`));
    return false;
  }
};

/**
 * Install Playwright browsers (Chromium by default)
 */
const installBrowsers = async () => {
  console.log(chalk.blue('Installing Chromium browser for Playwright...'));
  try {
    execSync('npx playwright install chromium', { stdio: 'inherit', timeout: 120000 });
    console.log(chalk.green('✓ Chromium browser installed'));
    return true;
  } catch (error) {
    console.error(chalk.red(`✗ Failed to install browsers: ${error.message}`));
    console.log(chalk.gray('Try manually: npx playwright install chromium'));
    return false;
  }
};

/**
 * Configure Playwright CLI
 */
export const configurePlaywright = async () => {
  console.log(chalk.cyan('\n=== Playwright Browser Automation ===\n'));
  console.log(chalk.gray('Headless browser for screenshots, testing, and web automation.\n'));

  // Check installation
  if (!isPlaywrightInstalled()) {
    console.log(chalk.yellow('! Playwright is not installed'));
    const installed = await installPlaywright();
    if (!installed) return false;
  } else {
    const version = getPlaywrightVersion();
    console.log(chalk.green(`✓ Playwright is installed${version ? ` (v${version})` : ''}`));
  }

  // Check browsers
  if (!isPlaywrightConfigured()) {
    console.log(chalk.yellow('! Playwright browsers are not installed'));
    const installed = await installBrowsers();
    if (!installed) return false;
  } else {
    console.log(chalk.green('✓ Chromium browser is available'));
  }

  console.log(chalk.green('\n✓ Playwright configuration complete'));
  console.log(chalk.gray('  CLI: npx playwright screenshot <url> <file>'));
  console.log(chalk.gray('  API: NODE_PATH=$(npm root -g) node script.js'));
  return true;
};
