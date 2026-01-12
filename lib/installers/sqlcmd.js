import chalk from 'chalk';
import inquirer from 'inquirer';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync, spawnSync } from 'child_process';
import { commandExists } from '../utils/platform.js';
import { getShellProfile, removeBlock, readFileSafe, removeSourceLine } from '../utils/shell.js';

// Old markers for cleanup
const OLD_ENV_BLOCK_START = '# === SQL Environment Switcher ===';
const OLD_ENV_BLOCK_END = '# === End SQL Environment Switcher ===';
const OLD_NEGSOFT_BLOCK_START = '# === NegSoft SQL Environment Switcher ===';
const OLD_NEGSOFT_BLOCK_END = '# === End NegSoft SQL Environment Switcher ===';

// Old files to clean up
const OLD_SQL_ENV_DIR = '.sql-env';
const OLD_CONFIG_FILE = '.sql-env.json';
const OLD_CREDENTIALS_FILE = '.sql-env-credentials';

/**
 * Check if sqlcmd is installed
 */
export const isSqlcmdInstalled = () => commandExists('sqlcmd');

/**
 * Check if go-sqlcmd (not legacy ODBC version)
 */
const isGoSqlcmd = () => {
  try {
    const version = execSync('sqlcmd --version 2>&1', { encoding: 'utf8' });
    return version.includes('go-sqlcmd');
  } catch {
    return false;
  }
};

/**
 * Install sqlcmd using go install
 */
export const installSqlcmd = async () => {
  if (isSqlcmdInstalled()) {
    if (isGoSqlcmd()) {
      console.log(chalk.green('✓ go-sqlcmd is installed'));
      return true;
    }
    console.log(chalk.yellow('! Legacy sqlcmd detected (ODBC-based)'));
    console.log(chalk.gray('  Native config requires go-sqlcmd: https://github.com/microsoft/go-sqlcmd'));
  } else {
    console.log(chalk.yellow('! sqlcmd is not installed'));
  }

  // Check if Go is available
  if (!commandExists('go')) {
    console.log(chalk.gray('Go is required to install go-sqlcmd.'));
    console.log(chalk.gray('Install Go: https://go.dev/doc/install'));
    console.log(chalk.gray('Or install go-sqlcmd directly: https://github.com/microsoft/go-sqlcmd'));
    return false;
  }

  const { install } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'install',
      message: 'Install go-sqlcmd using go install?',
      default: true,
    },
  ]);

  if (!install) {
    console.log(chalk.gray('Skipping sqlcmd installation.'));
    return false;
  }

  console.log(chalk.blue('Installing go-sqlcmd...'));
  try {
    execSync('go install github.com/microsoft/go-sqlcmd/cmd/sqlcmd@latest', {
      stdio: 'inherit',
      env: { ...process.env },
    });
    console.log(chalk.green('✓ go-sqlcmd installed successfully'));
    console.log(chalk.gray('  Ensure ~/go/bin is in your PATH'));
    return true;
  } catch (error) {
    console.error(chalk.red(`✗ Failed to install: ${error.message}`));
    return false;
  }
};

/**
 * Get existing sqlcmd contexts
 */
const getExistingContexts = () => {
  try {
    const result = spawnSync('sqlcmd', ['config', 'get-contexts'], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (result.status !== 0) return [];

    // Parse output - skip header line, extract context names (first column)
    // Format: "* context-name  endpoint-name  user-name" or "  context-name ..."
    return result.stdout
      .split('\n')
      .slice(1) // Skip header
      .filter((line) => line.trim())
      .map((line) => line.replace(/^\*?\s*/, '').split(/\s+/)[0])
      .filter(Boolean);
  } catch {
    return [];
  }
};

/**
 * Add a sqlcmd endpoint (uses spawnSync to avoid command injection)
 */
const addEndpoint = (name, address, port) => {
  const result = spawnSync('sqlcmd', ['config', 'add-endpoint', '--name', name, '--address', address, '--port', port], {
    stdio: 'pipe',
  });
  return result.status === 0;
};

/**
 * Add a sqlcmd user (uses spawnSync to avoid command injection)
 */
const addUser = (name, username, password) => {
  const result = spawnSync(
    'sqlcmd',
    ['config', 'add-user', '--name', name, '--username', username, '--password-encryption', 'none'],
    {
      stdio: 'pipe',
      env: { ...process.env, SQLCMD_PASSWORD: password, SQLCMDPASSWORD: undefined },
    }
  );
  return result.status === 0;
};

/**
 * Add a sqlcmd context (uses spawnSync to avoid command injection)
 */
const addContext = (name, endpoint, user) => {
  const result = spawnSync('sqlcmd', ['config', 'add-context', '--name', name, '--endpoint', endpoint, '--user', user], {
    stdio: 'pipe',
  });
  return result.status === 0;
};

/**
 * Clean up old sql-env installation
 */
const cleanupOldInstallation = () => {
  const homeDir = os.homedir();
  const { profilePath } = getShellProfile();
  let cleaned = false;

  // Clean up shell profile
  let profileContent = readFileSafe(profilePath);
  if (profileContent.includes(OLD_NEGSOFT_BLOCK_START)) {
    profileContent = removeBlock(profileContent, OLD_NEGSOFT_BLOCK_START, OLD_NEGSOFT_BLOCK_END);
    cleaned = true;
  }
  if (profileContent.includes(OLD_ENV_BLOCK_START)) {
    profileContent = removeBlock(profileContent, OLD_ENV_BLOCK_START, OLD_ENV_BLOCK_END);
    cleaned = true;
  }
  if (cleaned) {
    fs.writeFileSync(profilePath, profileContent.trim() + '\n');
  }

  // Remove source line for sql-env.sh
  const oldScriptPath = path.join(homeDir, OLD_SQL_ENV_DIR, 'sql-env.sh');
  if (removeSourceLine(profilePath, oldScriptPath)) {
    cleaned = true;
  }

  // Remove old files
  const oldDir = path.join(homeDir, OLD_SQL_ENV_DIR);
  const oldConfig = path.join(homeDir, OLD_CONFIG_FILE);
  const oldCreds = path.join(homeDir, OLD_CREDENTIALS_FILE);

  if (fs.existsSync(oldDir)) {
    fs.rmSync(oldDir, { recursive: true });
    cleaned = true;
  }
  if (fs.existsSync(oldConfig)) {
    fs.unlinkSync(oldConfig);
    cleaned = true;
  }
  if (fs.existsSync(oldCreds)) {
    fs.unlinkSync(oldCreds);
    cleaned = true;
  }

  return cleaned;
};

/**
 * Check for old sql-env installation
 */
const hasOldInstallation = () => {
  const homeDir = os.homedir();
  const { profilePath } = getShellProfile();
  const profileContent = readFileSafe(profilePath);

  return (
    profileContent.includes(OLD_ENV_BLOCK_START) ||
    profileContent.includes(OLD_NEGSOFT_BLOCK_START) ||
    fs.existsSync(path.join(homeDir, OLD_SQL_ENV_DIR)) ||
    fs.existsSync(path.join(homeDir, OLD_CONFIG_FILE)) ||
    fs.existsSync(path.join(homeDir, OLD_CREDENTIALS_FILE))
  );
};

/**
 * Configure sqlcmd contexts
 */
export const configureSqlEnv = async () => {
  console.log(chalk.cyan('\n=== SQL Server Contexts ===\n'));

  if (!isSqlcmdInstalled() || !isGoSqlcmd()) {
    console.log(chalk.yellow('go-sqlcmd is required for context management.'));
    return false;
  }

  // Check for old installation
  if (hasOldInstallation()) {
    console.log(chalk.yellow('Found old sql-env installation.'));
    const { cleanup } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'cleanup',
        message: 'Remove old sql-env files? (contexts are now managed by sqlcmd config)',
        default: true,
      },
    ]);
    if (cleanup) {
      cleanupOldInstallation();
      console.log(chalk.green('✓ Old sql-env files removed'));
    }
  }

  const existingContexts = getExistingContexts();
  if (existingContexts.length > 0) {
    console.log(chalk.blue('Existing contexts:'), existingContexts.join(', '));
  }

  console.log(chalk.gray('\nThis sets up sqlcmd config contexts for easy database switching.'));
  console.log(chalk.gray('Usage: sqlcmd config use-context <name> && sqlcmd query -d <db> "..."\n'));

  let addMore = existingContexts.length === 0;

  // Loop to add contexts
  while (true) {
    const { addNew } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'addNew',
        message: addMore ? 'Add another context?' : 'Add a new context?',
        default: !addMore,
      },
    ]);

    if (!addNew) {
      if (!addMore) {
        console.log(chalk.gray('Skipping context configuration.'));
      }
      break;
    }

    // Collect context details
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'contextName',
        message: 'Context name (e.g., prod-ro, dev, local):',
        validate: (input) => /^[a-z][a-z0-9-]*$/.test(input) || 'Use lowercase letters, numbers, hyphens',
      },
      {
        type: 'input',
        name: 'server',
        message: 'Server address:',
        validate: (input) => input.trim() !== '' || 'Required',
      },
      {
        type: 'input',
        name: 'port',
        message: 'Port:',
        default: '1433',
        validate: (input) => /^\d+$/.test(input) || 'Must be a number',
      },
      {
        type: 'input',
        name: 'username',
        message: 'Username:',
        validate: (input) => input.trim() !== '' || 'Required',
      },
      {
        type: 'password',
        name: 'password',
        message: 'Password:',
        mask: '*',
        validate: (input) => input.trim() !== '' || 'Required',
      },
    ]);

    const { contextName, server, port, username, password } = answers;
    const endpointName = `${contextName}-endpoint`;
    const userName = `${contextName}-user`;

    console.log(chalk.blue('\nCreating context...'));

    // Add endpoint
    if (!addEndpoint(endpointName, server, port)) {
      console.log(chalk.yellow(`Endpoint ${endpointName} may already exist, continuing...`));
    }

    // Add user
    if (!addUser(userName, username, password)) {
      console.log(chalk.yellow(`User ${userName} may already exist, continuing...`));
    }

    // Add context
    if (!addContext(contextName, endpointName, userName)) {
      console.log(chalk.red(`✗ Failed to create context ${contextName}`));
      return false;
    }

    console.log(chalk.green(`✓ Context '${contextName}' created`));
    console.log(chalk.gray(`\nUsage:`));
    console.log(chalk.gray(`  sqlcmd config use-context ${contextName}`));
    console.log(chalk.gray(`  sqlcmd query -d <database> "SELECT ..."`));

    addMore = true;
  }

  return true;
};
