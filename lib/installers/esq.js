import chalk from 'chalk';
import inquirer from 'inquirer';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { commandExists } from '../utils/platform.js';

/**
 * Check if esq binary exists (in PATH or common locations)
 */
const findEsqBinary = () => {
  if (commandExists('esq')) {
    return 'esq';
  }

  const locations = [
    path.join(os.homedir(), 'go', 'bin', 'esq'),
    path.join(os.homedir(), 'bin', 'esq'),
    path.join(os.homedir(), '.local', 'bin', 'esq'),
    '/usr/local/bin/esq',
  ];

  for (const loc of locations) {
    if (fs.existsSync(loc)) {
      return loc;
    }
  }

  return null;
};

// Repository for esq-cli - can be overridden via environment variable
const rawRepo = process.env.ESQ_CLI_REPO || 'enthus-appdev/esq-cli';
export const ESQ_CLI_REPO = /^[\w.-]+\/[\w.-]+$/.test(rawRepo) ? rawRepo : 'enthus-appdev/esq-cli';

/**
 * Check if esq is installed
 */
export const isEsqInstalled = () => findEsqBinary() !== null;

/**
 * Check if esq is configured (has at least one environment)
 */
export const isEsqConfigured = () => {
  const binary = findEsqBinary();
  if (!binary) return false;

  try {
    const result = spawnSync(binary, ['config', 'list'], { stdio: 'pipe', encoding: 'utf8' });
    if (result.status !== 0) return false;
    return result.stdout.includes('http');
  } catch {
    return false;
  }
};

/**
 * Get current/active esq environment name
 */
export const getCurrentEnv = () => {
  const binary = findEsqBinary();
  if (!binary) return null;

  try {
    const result = spawnSync(binary, ['config', 'list'], { stdio: 'pipe', encoding: 'utf8' });
    if (result.status !== 0) return null;
    const lines = result.stdout.split('\n');
    for (const line of lines) {
      if (line.startsWith('*')) {
        const match = line.match(/\*\s*(\S+)/);
        if (match) return match[1];
      }
    }
    return null;
  } catch {
    return null;
  }
};

/**
 * Configure git and Go for private repo access
 */
const configurePrivateRepoAccess = () => {
  const repoOrg = ESQ_CLI_REPO.split('/')[0];
  const goprivate = `github.com/${repoOrg}/*`;
  process.env.GOPRIVATE = goprivate;

  const gitResult = spawnSync('git', ['config', '--global', '--get', 'url.git@github.com:.insteadOf'], {
    encoding: 'utf8',
    stdio: 'pipe',
  });

  const needsConfig = gitResult.status !== 0 || !gitResult.stdout.trim().includes('https://github.com/');

  if (needsConfig) {
    console.log(chalk.gray('Configuring git to use SSH for GitHub...'));
    const setResult = spawnSync('git', ['config', '--global', 'url.git@github.com:.insteadOf', 'https://github.com/'], {
      stdio: 'pipe',
    });
    if (setResult.status !== 0) {
      console.log(chalk.yellow('Could not configure git SSH rewrite'));
    }
  }

  return goprivate;
};

/**
 * Install esq via go install
 */
const installEsq = async () => {
  const platform = process.platform;

  if (platform !== 'darwin' && platform !== 'linux') {
    console.log(chalk.yellow('esq installation is only supported on macOS and Linux.'));
    console.log(chalk.gray(`Please install manually from: https://github.com/${ESQ_CLI_REPO}`));
    return false;
  }

  if (!commandExists('go')) {
    console.log(chalk.yellow('Go is required but not installed.'));
    console.log(chalk.gray('Install Go from: https://go.dev/dl/'));
    return false;
  }

  console.log(chalk.blue('Installing esq via go install...'));

  const goprivate = configurePrivateRepoAccess();
  console.log(chalk.gray(`GOPRIVATE=${goprivate}`));

  try {
    const result = spawnSync('go', ['install', `github.com/${ESQ_CLI_REPO}/cmd/esq@latest`], {
      stdio: 'inherit',
      env: { ...process.env, GOPRIVATE: goprivate },
    });
    if (result.status !== 0) throw new Error(`Install failed with exit code ${result.status}`);

    const binaryPath = findEsqBinary();
    if (!binaryPath) {
      console.error(chalk.red('✗ Install completed but esq not found'));
      console.log(chalk.gray('Check ~/go/bin or ensure GOPATH/bin is in your PATH'));
      return false;
    }

    console.log(chalk.green('✓ esq installed successfully'));

    if (!commandExists('esq')) {
      console.log(chalk.yellow(`\n⚠ esq installed to ${binaryPath}`));
      console.log(chalk.yellow("But it's not in your PATH. Add it with:"));
      console.log(chalk.gray(`  export PATH="$PATH:${path.dirname(binaryPath)}"`));
    }

    return true;
  } catch (error) {
    console.error(chalk.red(`✗ Failed to install: ${error.message}`));
    console.log(chalk.gray('Manual installation:'));
    console.log(chalk.gray(`  git clone git@github.com:${ESQ_CLI_REPO}.git`));
    console.log(chalk.gray('  cd esq-cli && make install'));
    return false;
  }
};

/**
 * Configure esq CLI
 */
export const configureEsqCli = async () => {
  console.log(chalk.cyan('\n=== Elasticsearch Query CLI (esq) Configuration ===\n'));

  let binary = findEsqBinary();

  if (!binary) {
    console.log(chalk.yellow('! esq is not installed'));

    const { install } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'install',
        message: 'Install esq?',
        default: true,
      },
    ]);

    if (install) {
      const success = await installEsq();
      if (!success) return false;
      binary = findEsqBinary();
    } else {
      console.log(chalk.gray('Skipping esq setup.'));
      return false;
    }
  } else {
    console.log(chalk.green('✓ esq is installed'));

    if (!commandExists('esq')) {
      console.log(chalk.yellow(`  Location: ${binary}`));
      console.log(chalk.yellow('  Note: Not in PATH. Add to your shell profile:'));
      console.log(chalk.gray(`    export PATH="$PATH:${path.dirname(binary)}"`));
    }

    const { reinstall } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'reinstall',
        message: 'Reinstall esq?',
        default: false,
      },
    ]);

    if (reinstall) {
      await installEsq();
      binary = findEsqBinary();
    }
  }

  if (!binary) {
    console.log(chalk.red('✗ esq binary not found'));
    return false;
  }

  // Check configuration
  const currentEnv = getCurrentEnv();

  if (currentEnv) {
    console.log(chalk.green(`✓ Active environment: ${chalk.white(currentEnv)}`));

    const { action } = await inquirer.prompt([
      {
        type: 'select',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: 'View current configuration', value: 'view' },
          { name: 'Done', value: 'done' },
        ],
      },
    ]);

    if (action === 'view') {
      console.log();
      spawnSync(binary, ['config', 'list'], { stdio: 'inherit' });
    }
  } else {
    console.log(chalk.yellow('No environments configured.'));
    console.log(chalk.gray('Configure with:'));
    console.log(chalk.gray(`  ${binary} config add <name> --url <elasticsearch-url>`));
    console.log(chalk.gray(`  ${binary} config use <name>`));
  }

  console.log(chalk.green('\n✓ esq configuration complete'));
  return true;
};
