import chalk from 'chalk';
import inquirer from 'inquirer';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { commandExists, detectPackageManager, installPackage } from '../utils/platform.js';
import { getShellProfile, removeBlock, readFileSafe, writeFileSecure } from '../utils/shell.js';

const ENV_BLOCK_START = '# === Enthus SQL Environment Switcher ===';
const ENV_BLOCK_END = '# === End Enthus SQL Environment Switcher ===';
const CREDENTIALS_FILE = '.sql-env-credentials';

// Default environment definitions
const SQL_ENVIRONMENTS = [
  {
    key: 'local',
    name: 'Local (Docker)',
    description: 'Local Docker SQL Server container',
    defaults: { server: 'localhost,1533', user: 'sa', database: 'Steps_Development' },
  },
  {
    key: 'stage',
    name: 'Staging',
    description: 'Staging environment database',
    defaults: { server: '', user: '', database: 'Steps_Development' },
  },
  {
    key: 'prod-ro',
    name: 'Production (Read-Only)',
    description: 'Production database with read-only access',
    defaults: { server: '', user: '', database: 'Steps' },
  },
  {
    key: 'prod-rw',
    name: 'Production (Read-Write)',
    description: 'Production database with write access - USE WITH CAUTION',
    defaults: { server: '', user: '', database: 'Steps' },
  },
];

/**
 * Check if sqlcmd is installed
 */
export const isSqlcmdInstalled = () => commandExists('sqlcmd');

/**
 * Install sqlcmd if not present
 */
export const installSqlcmd = async () => {
  if (isSqlcmdInstalled()) {
    console.log(chalk.green('✓ sqlcmd is installed'));
    return true;
  }

  console.log(chalk.yellow('! sqlcmd is not installed'));

  const pkgManager = detectPackageManager();
  if (!pkgManager) {
    console.log(chalk.gray('No supported package manager found.'));
    console.log(chalk.gray('Please install manually: https://learn.microsoft.com/en-us/sql/tools/sqlcmd'));
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
 * Convert environment key to variable name (e.g., prod-ro -> PROD_RO)
 */
const keyToVarName = (key) => key.toUpperCase().replace(/-/g, '_');

/**
 * Generate shell function for sql-env
 */
const generateEnvBlock = (environments) => {
  if (environments.length === 0) return '';

  const envCases = environments
    .map(
      (env) => `    ${env.key})
      export SQLCMDSERVER='${env.server}'
      export SQLCMDUSER='${env.user}'
      export SQLCMDPASSWORD="\${SQL_ENV_${keyToVarName(env.key)}_PASSWORD}"
      export SQLCMDDATABASE='${env.database}'
      export SQL_ENV='${env.key}'
      echo "Switched to ${env.name} (${env.server})"
      ;;`
    )
    .join('\n');

  const envList = environments.map((env) => `#   ${env.key.padEnd(10)} - ${env.name}`).join('\n');
  const defaultEnv = environments.find((e) => e.key === 'local')?.key || environments[0].key;

  return `
${ENV_BLOCK_START}
# SQL Server environment switcher
# Usage: sql-env <environment>
#
# Available environments:
${envList}
#
# After switching, use sqlcmd without credentials:
#   sqlcmd -Q "SELECT @@VERSION"

sql-env() {
  [ -f "$HOME/${CREDENTIALS_FILE}" ] && . "$HOME/${CREDENTIALS_FILE}"
  case "$1" in
${envCases}
    "")
      echo "Current: $SQL_ENV"
      echo ""
      echo "Available environments:"
${environments.map((env) => `      echo "  ${env.key.padEnd(10)} - ${env.name}"`).join('\n')}
      echo ""
      echo "Usage: sql-env <environment>"
      ;;
    *)
      echo "Unknown environment: $1"
      echo "Run sql-env without arguments to see available environments"
      ;;
  esac
}

# Default to ${defaultEnv} environment on shell startup
sql-env ${defaultEnv} > /dev/null 2>&1
${ENV_BLOCK_END}
`;
};

/**
 * Generate credentials file content
 */
const generateCredentialsContent = (environments) => {
  const lines = [
    '# SQL Environment Credentials',
    '# This file contains sensitive passwords - do not commit to version control!',
    '# File permissions: 0600 (read/write for owner only)',
    '',
    ...environments.map(
      (env) => `export SQL_ENV_${keyToVarName(env.key)}_PASSWORD='${env.password.replace(/'/g, "'\\''")}'`
    ),
    '',
  ];
  return lines.join('\n');
};

/**
 * Prompt for environment configuration
 */
const promptEnvironmentConfig = async (envDef) => {
  console.log(chalk.cyan(`\n--- ${envDef.name} ---`));
  console.log(chalk.gray(envDef.description));

  const { configure } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'configure',
      message: `Configure ${envDef.name}?`,
      default: envDef.key === 'local',
    },
  ]);

  if (!configure) return null;

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'server',
      message: 'Server (host,port):',
      default: envDef.defaults.server,
      validate: (input) => (input.trim() ? true : 'Server is required'),
    },
    {
      type: 'input',
      name: 'user',
      message: 'Username:',
      default: envDef.defaults.user,
      validate: (input) => (input.trim() ? true : 'Username is required'),
    },
    {
      type: 'password',
      name: 'password',
      message: 'Password:',
      mask: '*',
      validate: (input) => (input.trim() ? true : 'Password is required'),
    },
    {
      type: 'input',
      name: 'database',
      message: 'Default database:',
      default: envDef.defaults.database,
    },
  ]);

  return { key: envDef.key, name: envDef.name, ...answers };
};

/**
 * Configure sql-env shell function
 */
export const configureSqlEnv = async () => {
  console.log(chalk.cyan('\n=== SQL Environment Switcher ===\n'));

  const { shell, profilePath } = getShellProfile();
  const existingContent = readFileSafe(profilePath);
  const isConfigured = existingContent.includes(ENV_BLOCK_START);

  console.log(chalk.blue('Shell:'), chalk.white(shell));
  console.log(chalk.blue('Profile:'), chalk.white(profilePath));

  if (isConfigured) {
    console.log(chalk.yellow('\n! sql-env is already configured'));
    const { action } = await inquirer.prompt([
      {
        type: 'select',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: 'Update existing configuration', value: 'update' },
          { name: 'Skip (keep existing)', value: 'skip' },
        ],
      },
    ]);

    if (action === 'skip') {
      console.log(chalk.gray('Keeping existing configuration.'));
      return true;
    }
  }

  console.log(chalk.blue('\nThis creates a sql-env function to switch between databases:\n'));
  console.log(chalk.gray('  sql-env local     # Switch to local Docker database'));
  console.log(chalk.gray('  sql-env stage     # Switch to staging'));
  console.log(chalk.gray('  sql-env prod-ro   # Switch to production (read-only)'));
  console.log(chalk.gray('  sql-env           # Show current environment'));
  console.log(chalk.gray('\nPasswords are stored securely in ~/.sql-env-credentials (mode 0600)\n'));

  // Collect configuration
  const configuredEnvs = [];
  for (const envDef of SQL_ENVIRONMENTS) {
    const envConfig = await promptEnvironmentConfig(envDef);
    if (envConfig) configuredEnvs.push(envConfig);
  }

  if (configuredEnvs.length === 0) {
    console.log(chalk.yellow('\nNo environments configured.'));
    return false;
  }

  // Summary
  console.log(chalk.blue('\n--- Configuration Summary ---'));
  for (const env of configuredEnvs) {
    console.log(chalk.gray(`  ${env.key.padEnd(10)}`), chalk.white(`${env.server} (${env.user})`));
  }

  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: `Add sql-env function to ${profilePath}?`,
      default: true,
    },
  ]);

  if (!confirm) {
    console.log(chalk.yellow('Configuration cancelled.'));
    return false;
  }

  // Apply configuration
  let content = removeBlock(existingContent, ENV_BLOCK_START, ENV_BLOCK_END);
  content = content.trimEnd() + generateEnvBlock(configuredEnvs);
  fs.writeFileSync(profilePath, content);

  // Write credentials file
  const credsFile = path.join(os.homedir(), CREDENTIALS_FILE);
  writeFileSecure(credsFile, generateCredentialsContent(configuredEnvs), 0o600);

  console.log(chalk.green(`\n✓ sql-env added to ${profilePath}`));
  console.log(chalk.green(`✓ Credentials saved to ${credsFile}`));

  return true;
};
