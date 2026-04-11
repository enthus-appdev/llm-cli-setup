import chalk from 'chalk';
import inquirer from 'inquirer';
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { commandExists } from '../utils/platform.js';

// Repository for atl-cli - can be overridden via environment variable
export const ATL_CLI_REPO = process.env.ATL_CLI_REPO || 'enthus-appdev/atl-cli';

/**
 * Find atl binary (in PATH or common locations)
 */
const findAtlBinary = () => {
  if (commandExists('atl')) {
    return 'atl';
  }

  const locations = [
    path.join(os.homedir(), 'go', 'bin', 'atl'),
    path.join(os.homedir(), '.local', 'bin', 'atl'),
    '/usr/local/bin/atl',
  ];

  for (const loc of locations) {
    if (fs.existsSync(loc)) {
      return loc;
    }
  }

  return null;
};

/**
 * Check if atl-cli is installed
 */
export const isAtlInstalled = () => findAtlBinary() !== null;

/**
 * Check if OAuth credentials are configured (separate from being logged in)
 */
export const hasOAuthCredentials = () => {
  const configPath = path.join(os.homedir(), '.config', 'atlassian', 'config.yaml');
  if (!fs.existsSync(configPath)) return false;

  try {
    const content = fs.readFileSync(configPath, 'utf8');
    // Check if OAuth client_id and client_secret are present
    return content.includes('client_id:') && content.includes('client_secret:');
  } catch {
    return false;
  }
};

/**
 * Check if atl-cli is authenticated (has valid token)
 */
export const isAtlAuthenticated = () => {
  const binary = findAtlBinary();
  if (!binary) return false;

  try {
    const output = execSync(`${binary} auth status`, { stdio: 'pipe', encoding: 'utf8' });
    return output.includes('Authenticated');
  } catch {
    return false;
  }
};

/**
 * Configure git and Go for private repo access
 */
const configurePrivateRepoAccess = () => {
  const repoOrg = ATL_CLI_REPO.split('/')[0];

  // Set GOPRIVATE for the organization
  const goprivate = `github.com/${repoOrg}/*`;
  process.env.GOPRIVATE = goprivate;

  // Check if git is configured to use SSH for GitHub
  try {
    const gitConfig = execSync('git config --global --get url.git@github.com:.insteadOf', {
      encoding: 'utf8',
      stdio: 'pipe',
    }).trim();

    if (gitConfig !== 'https://github.com/') {
      console.log(chalk.gray('Configuring git to use SSH for GitHub...'));
      execSync('git config --global url."git@github.com:".insteadOf "https://github.com/"', {
        stdio: 'pipe',
      });
    }
  } catch {
    // Config doesn't exist, set it
    console.log(chalk.gray('Configuring git to use SSH for GitHub...'));
    try {
      execSync('git config --global url."git@github.com:".insteadOf "https://github.com/"', {
        stdio: 'pipe',
      });
    } catch (error) {
      console.log(chalk.yellow(`Could not configure git: ${error.message}`));
    }
  }

  return goprivate;
};

/**
 * Install atl-cli via go install
 */
const installAtl = async () => {
  const platform = process.platform;

  if (platform !== 'darwin' && platform !== 'linux') {
    console.log(chalk.yellow('atl-cli installation is only supported on macOS and Linux.'));
    console.log(chalk.gray(`Please install manually from: https://github.com/${ATL_CLI_REPO}`));
    return false;
  }

  // Check if Go is installed
  if (!commandExists('go')) {
    console.log(chalk.yellow('Go is required but not installed.'));
    console.log(chalk.gray('Install Go from: https://go.dev/dl/'));
    return false;
  }

  console.log(chalk.blue('Installing atl-cli via go install...'));

  // Configure for private repo access
  const goprivate = configurePrivateRepoAccess();
  console.log(chalk.gray(`GOPRIVATE=${goprivate}`));

  try {
    const installCmd = `GOPRIVATE=${goprivate} go install github.com/${ATL_CLI_REPO}/cmd/atl@latest`;
    execSync(installCmd, {
      stdio: 'inherit',
      shell: true,
    });

    // Find the installed binary
    const binaryPath = findAtlBinary();
    if (!binaryPath) {
      console.error(chalk.red('✗ Install completed but atl not found'));
      console.log(chalk.gray('Check ~/go/bin or ensure GOPATH/bin is in your PATH'));
      return false;
    }

    console.log(chalk.green('✓ atl-cli installed successfully'));

    // Warn if not in PATH
    if (!commandExists('atl')) {
      console.log(chalk.yellow(`\n⚠ atl installed to ${binaryPath}`));
      console.log(chalk.yellow("But it's not in your PATH. Add it with:"));
      console.log(chalk.gray(`  export PATH="$PATH:${path.dirname(binaryPath)}"`));
    }

    return true;
  } catch (error) {
    console.error(chalk.red(`✗ Failed to install: ${error.message}`));
    console.log(chalk.gray('Manual installation:'));
    console.log(chalk.gray(`  git clone git@github.com:${ATL_CLI_REPO}.git`));
    console.log(chalk.gray('  cd atl-cli && make install'));
    return false;
  }
};

/**
 * Configure Atlassian CLI
 */
export const configureAtlassianCli = async () => {
  console.log(chalk.cyan('\n=== Atlassian CLI Configuration ===\n'));

  const binary = findAtlBinary();

  // Check installation
  if (!binary) {
    console.log(chalk.yellow('! Atlassian CLI (atl) is not installed'));

    const { install } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'install',
        message: 'Install atl-cli?',
        default: true,
      },
    ]);

    if (install) {
      const success = await installAtl();
      if (!success) return false;
    } else {
      console.log(chalk.gray('Skipping Atlassian CLI setup.'));
      return false;
    }
  } else {
    console.log(chalk.green('✓ Atlassian CLI is installed'));

    // Show path if not in PATH
    if (!commandExists('atl')) {
      console.log(chalk.yellow(`  Location: ${binary}`));
      console.log(chalk.yellow('  Note: Not in PATH. Add to your shell profile:'));
      console.log(chalk.gray(`    export PATH="$PATH:${path.dirname(binary)}"`));
    }

    const { reinstall } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'reinstall',
        message: 'Reinstall atl-cli?',
        default: false,
      },
    ]);

    if (reinstall) await installAtl();
  }

  // Get binary path again (might have changed after install)
  const atlBinary = findAtlBinary() || 'atl';

  // Check current state
  const hasOAuth = hasOAuthCredentials();
  const isAuthenticated = isAtlAuthenticated();

  console.log(
    chalk.blue('OAuth credentials:'),
    hasOAuth ? chalk.green('configured') : chalk.yellow('not configured')
  );
  console.log(
    chalk.blue('Authentication:'),
    isAuthenticated ? chalk.green('authenticated') : chalk.yellow('not authenticated')
  );

  // If already fully set up, offer to reconfigure
  if (isAuthenticated) {
    console.log(chalk.green('\n✓ Already authenticated with Atlassian'));

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

  // Step 1: OAuth setup (only if credentials don't exist)
  if (!hasOAuth) {
    console.log(chalk.blue('\n--- Step 1: OAuth Setup ---'));
    console.log(chalk.gray('You need to create an OAuth app in Atlassian Developer Console.'));
    console.log(chalk.gray('The wizard will guide you through this process.\n'));

    const { runSetup } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'runSetup',
        message: 'Run OAuth setup wizard?',
        default: true,
      },
    ]);

    if (runSetup) {
      try {
        execSync(`${atlBinary} auth setup`, { stdio: 'inherit' });
        console.log(chalk.green('\n✓ OAuth setup completed'));
      } catch (error) {
        console.error(chalk.red(`\n✗ OAuth setup failed: ${error.message}`));
        console.log(chalk.gray(`Try again with: ${atlBinary} auth setup`));
        return false;
      }
    } else {
      console.log(chalk.yellow('\nOAuth setup is required before login.'));
      console.log(chalk.gray(`Run manually: ${atlBinary} auth setup`));
      return false;
    }
  } else {
    console.log(chalk.green('\n✓ OAuth credentials already configured'));
  }

  // Step 2: Login (always run if not authenticated)
  console.log(chalk.blue('\n--- Step 2: Login ---'));
  console.log(chalk.gray('This will open a browser window for authentication.\n'));

  const { runLogin } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'runLogin',
      message: 'Open browser to authenticate?',
      default: true,
    },
  ]);

  if (!runLogin) {
    console.log(chalk.yellow('\nSkipping login.'));
    console.log(chalk.gray(`Run manually: ${atlBinary} auth login`));
    return false;
  }

  try {
    execSync(`${atlBinary} auth login`, { stdio: 'inherit' });
    console.log(chalk.green('\n✓ Atlassian CLI authenticated successfully'));
    return true;
  } catch (error) {
    console.error(chalk.red(`\n✗ Authentication failed: ${error.message}`));
    console.log(chalk.gray(`Try again with: ${atlBinary} auth login`));
    return false;
  }
};
