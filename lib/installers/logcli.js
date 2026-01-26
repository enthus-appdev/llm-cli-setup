import chalk from 'chalk';
import inquirer from 'inquirer';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
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

  console.log(chalk.blue('Installing logcli from GitHub releases...'));
  console.log(chalk.gray('Downloading latest release from grafana/loki...\n'));

  try {
    // Get latest version
    const releaseInfo = execSync('curl -s https://api.github.com/repos/grafana/loki/releases/latest', {
      encoding: 'utf8',
    });
    const release = JSON.parse(releaseInfo);
    const version = release.tag_name;

    // Download and install to ~/.local/bin (no sudo required)
    const filename = `logcli-${osName}-${archName}.zip`;
    const downloadUrl = `https://github.com/grafana/loki/releases/download/${version}/${filename}`;

    const installDir = path.join(os.homedir(), '.local', 'bin');
    const tmpDir = '/tmp/logcli-install';

    execSync(`mkdir -p ${installDir}`, { shell: true });
    execSync(`mkdir -p ${tmpDir}`, { shell: true });
    execSync(`curl -sL "${downloadUrl}" -o ${tmpDir}/logcli.zip`, { shell: true });
    execSync(`unzip -o ${tmpDir}/logcli.zip -d ${tmpDir}`, { shell: true, stdio: 'pipe' });
    execSync(`mv ${tmpDir}/logcli-${osName}-${archName} ${installDir}/logcli`, { shell: true });
    execSync(`chmod +x ${installDir}/logcli`, { shell: true });
    execSync(`rm -rf ${tmpDir}`, { shell: true });

    const binaryPath = path.join(installDir, 'logcli');
    console.log(chalk.green(`✓ logcli ${version} installed successfully`));
    return { success: true, binaryPath };
  } catch (error) {
    console.error(chalk.red(`✗ Failed to install: ${error.message}`));
    console.log(chalk.gray('Manual installation: https://github.com/grafana/loki/releases'));
    return { success: false, binaryPath: null };
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
      console.log(chalk.yellow("  Note: Not in PATH. Add to your shell profile:"));
      console.log(chalk.gray(`    export PATH="$PATH:${path.dirname(binary)}"`));
    }

    // Check version
    try {
      const version = execSync(`${binary} --version`, { encoding: 'utf8' }).trim();
      console.log(chalk.gray(`  Version: ${version}`));
    } catch {
      // Version check failed, continue anyway
    }
  }

  // Show configuration instructions
  console.log(chalk.blue('\nConfiguration:'));
  console.log(chalk.gray('logcli uses environment variables for authentication:\n'));
  console.log(chalk.white('  export LOKI_ADDR="<GRAFANA_URL>/api/datasources/proxy/<DATASOURCE_ID>"'));
  console.log(chalk.white('  export LOKI_BEARER_TOKEN="<GRAFANA_TOKEN>"\n'));
  console.log(chalk.gray('Get these values from your Grafana instance.'));
  console.log(chalk.gray('The datasource ID can be found in the Loki datasource URL.\n'));

  console.log(chalk.green('✓ logcli configuration complete'));
  return true;
};
