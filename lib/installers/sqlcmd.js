import chalk from 'chalk';
import inquirer from 'inquirer';
import { execSync, spawnSync } from 'child_process';
import { commandExists, detectPackageManager, installPackage } from '../utils/platform.js';

/**
 * Check if sqlcmd is installed
 */
export const isSqlcmdInstalled = () => commandExists('sqlcmd');

/**
 * Check if go-sqlcmd (not legacy ODBC version).
 * Legacy ODBC sqlcmd doesn't support --version (only -?), so success means go-sqlcmd.
 */
const isGoSqlcmd = () => {
  try {
    execSync('sqlcmd --version', { encoding: 'utf8', stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
};

/**
 * Install sqlcmd if not present
 */
export const installSqlcmd = async () => {
  if (isSqlcmdInstalled()) {
    if (isGoSqlcmd()) {
      console.log(chalk.green('✓ go-sqlcmd is installed'));
    } else {
      console.log(chalk.green('✓ sqlcmd is installed'));
      console.log(chalk.gray('  Note: go-sqlcmd recommended for native config support'));
    }
    return true;
  }

  console.log(chalk.yellow('! sqlcmd is not installed'));

  const pkgManager = detectPackageManager();
  if (!pkgManager) {
    console.log(chalk.gray('No supported package manager found.'));
    console.log(chalk.gray('Install manually: https://github.com/microsoft/go-sqlcmd'));
    return false;
  }

  const { install } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'install',
      message: `Install sqlcmd using ${pkgManager.name}?`,
      default: true,
    },
  ]);

  if (!install) {
    console.log(chalk.gray('Skipping sqlcmd installation.'));
    return false;
  }

  console.log(chalk.blue('Installing sqlcmd...'));
  try {
    await installPackage('sqlcmd', pkgManager, 'sqlcmd');
    console.log(chalk.green('✓ sqlcmd installed successfully'));
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
  const result = spawnSync(
    'sqlcmd',
    ['config', 'add-endpoint', '--name', name, '--address', address, '--port', port],
    {
      stdio: 'pipe',
    }
  );
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
  const result = spawnSync(
    'sqlcmd',
    ['config', 'add-context', '--name', name, '--endpoint', endpoint, '--user', user],
    {
      stdio: 'pipe',
    }
  );
  return result.status === 0;
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

  const existingContexts = getExistingContexts();
  if (existingContexts.length > 0) {
    console.log(chalk.blue('Existing contexts:'), existingContexts.join(', '));
  }

  console.log(chalk.gray('\nThis sets up sqlcmd config contexts for easy database switching.'));
  console.log(
    chalk.gray('Usage: sqlcmd config use-context <name> && sqlcmd query -d <db> "..."\n')
  );

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
        validate: (input) =>
          /^[a-z][a-z0-9-]*$/.test(input) || 'Use lowercase letters, numbers, hyphens',
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
