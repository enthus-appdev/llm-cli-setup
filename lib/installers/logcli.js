import chalk from 'chalk';
import inquirer from 'inquirer';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { commandExists, getPlatformInfo } from '../utils/platform.js';

/**
 * Find logcli binary (in PATH or common locations)
 */
const findLogcliBinary = () => {
  // First check if it's in PATH
  if (commandExists('logcli')) {
    return 'logcli';
  }

  // Check common installation locations
  const locations = [
    path.join(os.homedir(), 'bin', 'logcli'),
    path.join(os.homedir(), '.local', 'bin', 'logcli'),
    '/usr/local/bin/logcli',
  ];

  for (const loc of locations) {
    if (fs.existsSync(loc)) {
      return loc;
    }
  }

  return null;
};

/**
 * Check if logcli is installed
 */
export const isLogcliInstalled = () => findLogcliBinary() !== null;

/**
 * Install logcli via binary download from GitHub releases
 */
const installViaBinary = async () => {
  const { platform, arch } = getPlatformInfo();

  // Map to GitHub release naming
  let osName = platform === 'darwin' ? 'darwin' : platform === 'linux' ? 'linux' : null;
  let archName = arch === 'x64' ? 'amd64' : arch === 'arm64' ? 'arm64' : null;

  if (!osName || !archName) {
    console.log(chalk.yellow(`Unsupported platform: ${platform}/${arch}`));
    return { success: false, binaryPath: null };
  }

  // Check for required tools
  if (!commandExists('curl')) {
    console.log(chalk.red('✗ curl is required but not installed'));
    return { success: false, binaryPath: null };
  }

  if (!commandExists('unzip')) {
    console.log(chalk.red('✗ unzip is required but not installed'));
    return { success: false, binaryPath: null };
  }

  console.log(chalk.blue('Installing logcli from GitHub releases...'));
  console.log(chalk.gray('Downloading latest release from grafana/loki...\n'));

  const installDir = path.join(os.homedir(), '.local', 'bin');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'logcli-install-'));

  try {
    // Get latest version
    const releaseInfo = execFileSync(
      'curl',
      ['-s', 'https://api.github.com/repos/grafana/loki/releases/latest'],
      { encoding: 'utf8' }
    );
    const release = JSON.parse(releaseInfo);
    const version = release.tag_name;

    // Validate version format (anchored to prevent injection via suffix)
    if (!/^v?\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
      throw new Error(`Invalid version format: ${version}`);
    }

    // Download and install to ~/.local/bin (no sudo required)
    const filename = `logcli-${osName}-${archName}.zip`;
    const downloadUrl = `https://github.com/grafana/loki/releases/download/${version}/${filename}`;
    const zipPath = path.join(tmpDir, 'logcli.zip');
    const extractedBinary = path.join(tmpDir, `logcli-${osName}-${archName}`);
    const targetBinary = path.join(installDir, 'logcli');

    fs.mkdirSync(installDir, { recursive: true });
    execFileSync('curl', ['-sL', downloadUrl, '-o', zipPath]);
    execFileSync('unzip', ['-o', zipPath, '-d', tmpDir], { stdio: 'pipe' });
    fs.renameSync(extractedBinary, targetBinary);
    fs.chmodSync(targetBinary, 0o755);

    const binaryPath = path.join(installDir, 'logcli');
    console.log(chalk.green(`✓ logcli ${version} installed successfully`));
    return { success: true, binaryPath };
  } catch (error) {
    console.error(chalk.red(`✗ Failed to install: ${error.message}`));
    console.log(chalk.gray('Manual installation: https://github.com/grafana/loki/releases'));
    return { success: false, binaryPath: null };
  } finally {
    // Clean up temp directory
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
};

/**
 * Configure logcli
 */
export const configureLogcli = async () => {
  console.log(chalk.cyan('\n=== Loki CLI (logcli) Configuration ===\n'));
  console.log(chalk.gray('logcli is the command-line tool for querying Grafana Loki.\n'));

  // Check installation
  let binary = findLogcliBinary();

  if (!binary) {
    console.log(chalk.yellow('! logcli is not installed'));

    const { install } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'install',
        message: 'Install logcli?',
        default: true,
      },
    ]);

    if (install) {
      const result = await installViaBinary();
      if (!result.success) {
        return false;
      }
      binary = result.binaryPath || findLogcliBinary();
      if (!binary) {
        console.log(chalk.red('✗ Could not find logcli after installation'));
        return false;
      }
    } else {
      console.log(chalk.gray('Skipping logcli setup.'));
      return false;
    }
  } else {
    console.log(chalk.green('✓ logcli is installed'));

    // Show path if not in PATH
    if (!commandExists('logcli')) {
      console.log(chalk.yellow(`  Location: ${binary}`));
      console.log(chalk.yellow('  Note: Not in PATH. Add to your shell profile:'));
      console.log(chalk.gray(`    export PATH="$PATH:${path.dirname(binary)}"`));
    }

    // Check version
    try {
      const version = execFileSync(binary, ['--version'], { encoding: 'utf8' }).trim();
      console.log(chalk.gray(`  Version: ${version}`));
    } catch {
      // Version check failed, continue anyway
    }
  }

  // Show configuration instructions
  console.log(chalk.blue('\nConfiguration:'));
  console.log(chalk.gray('logcli uses environment variables for authentication:\n'));
  console.log(
    chalk.white('  export LOKI_ADDR="<GRAFANA_URL>/api/datasources/proxy/<DATASOURCE_ID>"')
  );
  console.log(chalk.white('  export LOKI_BEARER_TOKEN="<GRAFANA_TOKEN>"\n'));
  console.log(chalk.gray('Get these values from your Grafana instance.'));
  console.log(chalk.gray('The datasource ID can be found in the Loki datasource URL.\n'));

  console.log(chalk.green('✓ logcli configuration complete'));
  return true;
};
