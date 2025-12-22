import chalk from 'chalk';
import inquirer from 'inquirer';
import { execSync } from 'child_process';
import { commandExists, detectPackageManager, getPlatformInfo } from '../utils/platform.js';

/**
 * Check if grafanactl is installed
 */
export const isGrafanactlInstalled = () => commandExists('grafanactl');

/**
 * Check if grafanactl is configured (has at least one context)
 */
export const isGrafanactlConfigured = () => {
  try {
    const result = execSync('grafanactl config check', { stdio: 'pipe', encoding: 'utf8' });
    return !result.includes('no contexts configured');
  } catch {
    return false;
  }
};

/**
 * Get current grafanactl context
 */
export const getCurrentContext = () => {
  try {
    return execSync('grafanactl config current-context', { stdio: 'pipe', encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
};

/**
 * Install grafanactl via go install
 */
const installViaGo = async () => {
  if (!commandExists('go')) {
    console.log(chalk.yellow('Go is required but not installed.'));
    console.log(chalk.gray('Install Go 1.24+ from: https://go.dev/dl/'));
    return false;
  }

  // Check Go version (requires 1.24+)
  try {
    const version = execSync('go version', { encoding: 'utf8' });
    const match = version.match(/go(\d+)\.(\d+)/);
    if (match) {
      const major = parseInt(match[1], 10);
      const minor = parseInt(match[2], 10);
      if (major < 1 || (major === 1 && minor < 24)) {
        console.log(chalk.yellow(`Go 1.24+ required, found ${match[0]}`));
        return false;
      }
    }
  } catch {
    console.log(chalk.yellow('Could not verify Go version'));
  }

  console.log(chalk.blue('Installing grafanactl via go install...'));
  try {
    execSync('go install github.com/grafana/grafanactl/cmd/grafanactl@latest', {
      stdio: 'inherit',
      shell: true,
    });

    // Verify installation
    if (!commandExists('grafanactl')) {
      console.log(chalk.yellow('grafanactl installed but not in PATH'));
      console.log(chalk.gray('Add ~/go/bin to your PATH'));
      return false;
    }

    console.log(chalk.green('✓ grafanactl installed successfully'));
    return true;
  } catch (error) {
    console.error(chalk.red(`✗ Failed to install: ${error.message}`));
    return false;
  }
};

/**
 * Install grafanactl via binary download
 */
const installViaBinary = async () => {
  const { platform, arch } = getPlatformInfo();

  // Map to GitHub release naming
  let osName = platform === 'darwin' ? 'darwin' : platform === 'linux' ? 'linux' : null;
  let archName = arch === 'x64' ? 'amd64' : arch === 'arm64' ? 'arm64' : null;

  if (!osName || !archName) {
    console.log(chalk.yellow(`Unsupported platform: ${platform}/${arch}`));
    return false;
  }

  console.log(chalk.blue('Installing grafanactl from binary...'));
  console.log(chalk.gray('Downloading latest release from GitHub...\n'));

  try {
    // Get latest version
    const releaseInfo = execSync(
      'curl -s https://api.github.com/repos/grafana/grafanactl/releases/latest',
      { encoding: 'utf8' }
    );
    const release = JSON.parse(releaseInfo);
    const version = release.tag_name.replace('v', '');

    // Download and install
    const filename = `grafanactl_${version}_${osName}_${archName}.tar.gz`;
    const downloadUrl = `https://github.com/grafana/grafanactl/releases/download/${release.tag_name}/${filename}`;

    const installDir = '/usr/local/bin';
    const tmpDir = '/tmp/grafanactl-install';

    execSync(`mkdir -p ${tmpDir}`, { shell: true });
    execSync(`curl -sL "${downloadUrl}" | tar xz -C ${tmpDir}`, { shell: true, stdio: 'inherit' });
    execSync(`sudo mv ${tmpDir}/grafanactl ${installDir}/`, { shell: true, stdio: 'inherit' });
    execSync(`rm -rf ${tmpDir}`, { shell: true });

    console.log(chalk.green('✓ grafanactl installed successfully'));
    return true;
  } catch (error) {
    console.error(chalk.red(`✗ Failed to install: ${error.message}`));
    console.log(chalk.gray('Manual installation: https://github.com/grafana/grafanactl/releases'));
    return false;
  }
};

/**
 * Install grafanactl
 */
const installGrafanactl = async () => {
  const { platform } = getPlatformInfo();

  if (platform !== 'darwin' && platform !== 'linux') {
    console.log(chalk.yellow('grafanactl installation is only supported on macOS and Linux.'));
    console.log(chalk.gray('Please install manually: https://github.com/grafana/grafanactl/releases'));
    return false;
  }

  // Offer installation methods
  const hasGo = commandExists('go');

  const choices = [];
  if (hasGo) {
    choices.push({ name: 'go install (recommended if Go 1.24+ is installed)', value: 'go' });
  }
  choices.push({ name: 'Download binary from GitHub releases', value: 'binary' });
  choices.push({ name: 'Skip installation', value: 'skip' });

  const { method } = await inquirer.prompt([
    {
      type: 'select',
      name: 'method',
      message: 'How would you like to install grafanactl?',
      choices,
    },
  ]);

  switch (method) {
    case 'go':
      return await installViaGo();
    case 'binary':
      return await installViaBinary();
    default:
      console.log(chalk.gray('Skipping grafanactl installation.'));
      return false;
  }
};

/**
 * Configure grafanactl context
 */
const configureContext = async () => {
  console.log(chalk.blue('\nConfiguring Grafana context...'));
  console.log(chalk.gray('A context defines how to connect to a Grafana instance.\n'));

  const { contextName } = await inquirer.prompt([
    {
      type: 'input',
      name: 'contextName',
      message: 'Context name (e.g., default, staging, prod):',
      default: 'default',
    },
  ]);

  const { serverUrl } = await inquirer.prompt([
    {
      type: 'input',
      name: 'serverUrl',
      message: 'Grafana server URL:',
      default: 'http://localhost:3000',
    },
  ]);

  const { orgId } = await inquirer.prompt([
    {
      type: 'input',
      name: 'orgId',
      message: 'Organization ID:',
      default: '1',
    },
  ]);

  const { authMethod } = await inquirer.prompt([
    {
      type: 'select',
      name: 'authMethod',
      message: 'Authentication method:',
      choices: [
        { name: 'Service Account Token (recommended)', value: 'token' },
        { name: 'Username/Password', value: 'basic' },
        { name: 'Skip authentication setup', value: 'skip' },
      ],
    },
  ]);

  try {
    // Set server and org
    execSync(`grafanactl config set contexts.${contextName}.grafana.server ${serverUrl}`, {
      stdio: 'pipe',
    });
    execSync(`grafanactl config set contexts.${contextName}.grafana.org-id ${orgId}`, {
      stdio: 'pipe',
    });

    if (authMethod === 'token') {
      console.log(chalk.gray('\nCreate a Service Account Token in Grafana:'));
      console.log(chalk.gray('  Administration → Service Accounts → Create token\n'));

      const { token } = await inquirer.prompt([
        {
          type: 'password',
          name: 'token',
          message: 'Service Account Token:',
          mask: '*',
        },
      ]);

      if (token) {
        execSync(`grafanactl config set contexts.${contextName}.grafana.token ${token}`, {
          stdio: 'pipe',
        });
      }
    } else if (authMethod === 'basic') {
      const { username } = await inquirer.prompt([
        {
          type: 'input',
          name: 'username',
          message: 'Username:',
          default: 'admin',
        },
      ]);

      const { password } = await inquirer.prompt([
        {
          type: 'password',
          name: 'password',
          message: 'Password:',
          mask: '*',
        },
      ]);

      execSync(`grafanactl config set contexts.${contextName}.grafana.user ${username}`, {
        stdio: 'pipe',
      });
      execSync(`grafanactl config set contexts.${contextName}.grafana.password ${password}`, {
        stdio: 'pipe',
      });
    }

    // Set as current context if it's the first one
    execSync(`grafanactl config use-context ${contextName}`, { stdio: 'pipe' });

    console.log(chalk.green(`\n✓ Context '${contextName}' configured`));

    // Verify connection
    console.log(chalk.blue('\nVerifying connection...'));
    try {
      execSync('grafanactl config check', { stdio: 'inherit' });
      console.log(chalk.green('✓ Connection verified'));
    } catch {
      console.log(chalk.yellow('! Could not verify connection (check credentials)'));
    }

    return true;
  } catch (error) {
    console.error(chalk.red(`\n✗ Configuration failed: ${error.message}`));
    return false;
  }
};

/**
 * Configure Grafana CLI
 */
export const configureGrafanaCli = async () => {
  console.log(chalk.cyan('\n=== Grafana CLI Configuration ===\n'));
  console.log(chalk.gray('grafanactl requires Grafana 12+ and is in public preview.\n'));

  // Check installation
  if (!isGrafanactlInstalled()) {
    console.log(chalk.yellow('! Grafana CLI (grafanactl) is not installed'));

    const { install } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'install',
        message: 'Install grafanactl?',
        default: true,
      },
    ]);

    if (install) {
      const success = await installGrafanactl();
      if (!success) return false;
    } else {
      console.log(chalk.gray('Skipping Grafana CLI setup.'));
      return false;
    }
  } else {
    console.log(chalk.green('✓ Grafana CLI is installed'));

    // Check version
    try {
      const version = execSync('grafanactl --version', { encoding: 'utf8' }).trim();
      console.log(chalk.gray(`  Version: ${version}`));
    } catch {
      // Version check failed, continue anyway
    }
  }

  // Check configuration
  const currentContext = getCurrentContext();

  if (currentContext) {
    console.log(chalk.green(`✓ Active context: ${chalk.white(currentContext)}`));

    const { action } = await inquirer.prompt([
      {
        type: 'select',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: 'Add another context', value: 'add' },
          { name: 'View current configuration', value: 'view' },
          { name: 'Done', value: 'done' },
        ],
      },
    ]);

    if (action === 'add') {
      await configureContext();
    } else if (action === 'view') {
      console.log();
      execSync('grafanactl config view', { stdio: 'inherit' });
    }
  } else {
    // No contexts configured
    const { configure } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'configure',
        message: 'Set up a Grafana context now?',
        default: true,
      },
    ]);

    if (configure) {
      await configureContext();
    } else {
      console.log(chalk.gray('\nSkipping context setup.'));
      console.log(chalk.gray('Configure later with: grafanactl config set contexts.<name>.grafana.server <url>'));
    }
  }

  console.log(chalk.green('\n✓ Grafana CLI configuration complete'));
  return true;
};
