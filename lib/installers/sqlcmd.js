import chalk from 'chalk';
import inquirer from 'inquirer';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { commandExists, detectPackageManager, installPackage } from '../utils/platform.js';
import { getShellProfile, removeBlock, readFileSafe, writeFileSecure } from '../utils/shell.js';

const ENV_BLOCK_START = '# === SQL Environment Switcher ===';
const ENV_BLOCK_END = '# === End SQL Environment Switcher ===';
const CONFIG_FILE = '.sql-env.json';
const CREDENTIALS_FILE = '.sql-env-credentials';

// Default environment templates (suggestions for new users)
const DEFAULT_TEMPLATES = [
  { key: 'local', name: 'Local (Docker)', server: 'localhost,1433', user: 'sa', database: 'master' },
  { key: 'dev', name: 'Development', server: '', user: '', database: '' },
  { key: 'stage', name: 'Staging', server: '', user: '', database: '' },
  { key: 'prod-ro', name: 'Production (Read-Only)', server: '', user: '', database: '' },
  { key: 'prod', name: 'Production (Read-Write)', server: '', user: '', database: '' },
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
 * Generate shell function for sql-env with subcommand support
 * The function reads from ~/.sql-env.json at runtime, allowing dynamic environment management
 */
const generateEnvBlock = () => {
  return `
${ENV_BLOCK_START}
# SQL Server environment switcher
# Usage:
#   sql-env              - Show current environment and list available
#   sql-env <name>       - Switch to environment
#   sql-env add [name]   - Add a new environment
#   sql-env remove <name> - Remove an environment
#   sql-env list         - List all environments
#
# Config: ~/${CONFIG_FILE}
# Credentials: ~/${CREDENTIALS_FILE}

sql-env() {
  local config_file="$HOME/${CONFIG_FILE}"
  local creds_file="$HOME/${CREDENTIALS_FILE}"

  # Source credentials if they exist
  [ -f "$creds_file" ] && . "$creds_file"

  # Helper to read JSON (uses jq if available, falls back to python)
  _sql_env_read_json() {
    if command -v jq >/dev/null 2>&1; then
      jq -r "$1" "$config_file" 2>/dev/null
    elif command -v python3 >/dev/null 2>&1; then
      python3 -c "import json,sys; d=json.load(open('$config_file')); print($2)" 2>/dev/null
    elif command -v python >/dev/null 2>&1; then
      python -c "import json,sys; d=json.load(open('$config_file')); print($2)" 2>/dev/null
    else
      echo ""
    fi
  }

  case "$1" in
    add)
      local env_key="$2"

      # Prompt for key if not provided
      if [ -z "$env_key" ]; then
        printf "Environment key (e.g., dev, stage, prod): "
        read env_key
      fi

      if [ -z "$env_key" ]; then
        echo "Error: Environment key is required"
        return 1
      fi

      # Validate key format
      if ! echo "$env_key" | grep -qE '^[a-z][a-z0-9-]*$'; then
        echo "Error: Key must start with lowercase letter and contain only a-z, 0-9, -"
        return 1
      fi

      # Check if already exists
      if [ -f "$config_file" ] && _sql_env_read_json ".environments[\"$env_key\"]" "d.get('environments',{}).get('$env_key')" | grep -q "server"; then
        echo "Environment '$env_key' already exists. Use 'sql-env remove $env_key' first."
        return 1
      fi

      # Prompt for configuration
      printf "Display name: "
      read env_name
      printf "Server (host,port): "
      read env_server
      printf "Username: "
      read env_user
      printf "Password: "
      stty -echo
      read env_password
      stty echo
      echo ""
      printf "Default database: "
      read env_database

      # Validate required fields
      if [ -z "$env_server" ] || [ -z "$env_user" ] || [ -z "$env_password" ]; then
        echo "Error: Server, username, and password are required"
        return 1
      fi

      [ -z "$env_name" ] && env_name="$env_key"

      # Update config file
      if [ -f "$config_file" ]; then
        if command -v jq >/dev/null 2>&1; then
          local tmp_file=$(mktemp)
          jq --arg key "$env_key" --arg name "$env_name" --arg server "$env_server" --arg user "$env_user" --arg db "$env_database" \\
            '.environments[$key] = {name: $name, server: $server, user: $user, database: $db}' "$config_file" > "$tmp_file" && mv "$tmp_file" "$config_file"
        else
          # Python fallback
          python3 -c "
import json
with open('$config_file', 'r') as f:
    data = json.load(f)
data.setdefault('environments', {})['$env_key'] = {'name': '$env_name', 'server': '$env_server', 'user': '$env_user', 'database': '$env_database'}
with open('$config_file', 'w') as f:
    json.dump(data, f, indent=2)
" 2>/dev/null || echo "Error: Could not update config. Install jq or python3."
        fi
      else
        # Create new config file
        if command -v jq >/dev/null 2>&1; then
          echo "{}" | jq --arg key "$env_key" --arg name "$env_name" --arg server "$env_server" --arg user "$env_user" --arg db "$env_database" \\
            '.environments[$key] = {name: $name, server: $server, user: $user, database: $db}' > "$config_file"
        else
          echo "{\\"environments\\": {\\"$env_key\\": {\\"name\\": \\"$env_name\\", \\"server\\": \\"$env_server\\", \\"user\\": \\"$env_user\\", \\"database\\": \\"$env_database\\"}}}" > "$config_file"
        fi
      fi

      # Update credentials file
      local var_name="SQL_ENV_$(echo "$env_key" | tr 'a-z-' 'A-Z_')_PASSWORD"

      # Remove old entry if exists
      if [ -f "$creds_file" ]; then
        grep -v "^export $var_name=" "$creds_file" > "$creds_file.tmp" 2>/dev/null || true
        mv "$creds_file.tmp" "$creds_file"
      fi

      # Add new entry
      echo "export $var_name='$(echo "$env_password" | sed "s/'/'\\\\''/g")'" >> "$creds_file"
      chmod 600 "$creds_file"

      echo "✓ Environment '$env_key' added"
      echo "  Switch to it with: sql-env $env_key"
      ;;

    remove)
      local env_key="$2"

      if [ -z "$env_key" ]; then
        echo "Usage: sql-env remove <environment>"
        return 1
      fi

      if [ ! -f "$config_file" ]; then
        echo "No environments configured"
        return 1
      fi

      # Remove from config
      if command -v jq >/dev/null 2>&1; then
        local tmp_file=$(mktemp)
        jq --arg key "$env_key" 'del(.environments[$key])' "$config_file" > "$tmp_file" && mv "$tmp_file" "$config_file"
      else
        python3 -c "
import json
with open('$config_file', 'r') as f:
    data = json.load(f)
data.get('environments', {}).pop('$env_key', None)
with open('$config_file', 'w') as f:
    json.dump(data, f, indent=2)
" 2>/dev/null
      fi

      # Remove from credentials
      local var_name="SQL_ENV_$(echo "$env_key" | tr 'a-z-' 'A-Z_')_PASSWORD"
      if [ -f "$creds_file" ]; then
        grep -v "^export $var_name=" "$creds_file" > "$creds_file.tmp" 2>/dev/null || true
        mv "$creds_file.tmp" "$creds_file"
      fi

      # Clear current env if it was the one removed
      [ "$SQL_ENV" = "$env_key" ] && unset SQL_ENV SQLCMDSERVER SQLCMDUSER SQLCMDPASSWORD SQLCMDDATABASE

      echo "✓ Environment '$env_key' removed"
      ;;

    list)
      if [ ! -f "$config_file" ]; then
        echo "No environments configured. Use 'sql-env add' to add one."
        return 0
      fi

      echo "Configured environments:"
      if command -v jq >/dev/null 2>&1; then
        jq -r '.environments | to_entries[] | "  \\(.key)\\t- \\(.value.name) (\\(.value.server))"' "$config_file" 2>/dev/null | column -t -s $'\\t'
      else
        python3 -c "
import json
with open('$config_file', 'r') as f:
    data = json.load(f)
for key, env in data.get('environments', {}).items():
    print(f\"  {key:<12} - {env.get('name', key)} ({env.get('server', 'no server')})\")
" 2>/dev/null
      fi

      [ -n "$SQL_ENV" ] && echo "" && echo "Current: $SQL_ENV"
      ;;

    "")
      # Show current and list
      [ -n "$SQL_ENV" ] && echo "Current: $SQL_ENV" && echo ""

      if [ ! -f "$config_file" ]; then
        echo "No environments configured."
        echo ""
        echo "Usage:"
        echo "  sql-env add          Add a new environment"
        echo "  sql-env <name>       Switch to environment"
        return 0
      fi

      echo "Available environments:"
      if command -v jq >/dev/null 2>&1; then
        jq -r '.environments | to_entries[] | "  \\(.key)\\t- \\(.value.name)"' "$config_file" 2>/dev/null | column -t -s $'\\t'
      else
        python3 -c "
import json
with open('$config_file', 'r') as f:
    data = json.load(f)
for key, env in data.get('environments', {}).items():
    print(f\"  {key:<12} - {env.get('name', key)}\")
" 2>/dev/null
      fi

      echo ""
      echo "Usage: sql-env <environment> | add | remove | list"
      ;;

    *)
      # Switch to environment
      local env_key="$1"

      if [ ! -f "$config_file" ]; then
        echo "No environments configured. Use 'sql-env add' to add one."
        return 1
      fi

      # Read environment config
      local env_data
      if command -v jq >/dev/null 2>&1; then
        env_data=$(jq -r ".environments[\\"$env_key\\"] | @json" "$config_file" 2>/dev/null)
      else
        env_data=$(python3 -c "
import json
with open('$config_file', 'r') as f:
    data = json.load(f)
env = data.get('environments', {}).get('$env_key')
if env:
    print(json.dumps(env))
" 2>/dev/null)
      fi

      if [ -z "$env_data" ] || [ "$env_data" = "null" ]; then
        echo "Unknown environment: $env_key"
        echo "Run 'sql-env list' to see available environments"
        return 1
      fi

      # Parse and export
      local env_server env_user env_database env_name
      if command -v jq >/dev/null 2>&1; then
        env_server=$(echo "$env_data" | jq -r '.server')
        env_user=$(echo "$env_data" | jq -r '.user')
        env_database=$(echo "$env_data" | jq -r '.database')
        env_name=$(echo "$env_data" | jq -r '.name')
      else
        env_server=$(python3 -c "import json; print(json.loads('$env_data').get('server',''))")
        env_user=$(python3 -c "import json; print(json.loads('$env_data').get('user',''))")
        env_database=$(python3 -c "import json; print(json.loads('$env_data').get('database',''))")
        env_name=$(python3 -c "import json; print(json.loads('$env_data').get('name','$env_key'))")
      fi

      local var_name="SQL_ENV_$(echo "$env_key" | tr 'a-z-' 'A-Z_')_PASSWORD"

      export SQLCMDSERVER="$env_server"
      export SQLCMDUSER="$env_user"
      export SQLCMDPASSWORD="$(eval echo \\$$var_name)"
      export SQLCMDDATABASE="$env_database"
      export SQL_ENV="$env_key"

      echo "Switched to $env_name ($env_server)"
      ;;
  esac
}
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
 * Generate config file content
 */
const generateConfigContent = (environments) => {
  const envMap = {};
  for (const env of environments) {
    envMap[env.key] = {
      name: env.name,
      server: env.server,
      user: env.user,
      database: env.database,
    };
  }
  return JSON.stringify({ environments: envMap }, null, 2);
};

/**
 * Prompt for environment configuration
 */
const promptEnvironmentConfig = async (envDef) => {
  console.log(chalk.cyan(`\n--- ${envDef.name} ---`));

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
      default: envDef.server,
      validate: (input) => (input.trim() ? true : 'Server is required'),
    },
    {
      type: 'input',
      name: 'user',
      message: 'Username:',
      default: envDef.user,
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
      default: envDef.database,
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
  const configPath = path.join(os.homedir(), CONFIG_FILE);
  const hasExistingConfig = fs.existsSync(configPath);

  console.log(chalk.blue('Shell:'), chalk.white(shell));
  console.log(chalk.blue('Profile:'), chalk.white(profilePath));

  if (isConfigured && hasExistingConfig) {
    console.log(chalk.green('\n✓ sql-env is already configured'));
    console.log(chalk.gray('\nYou can manage environments directly:'));
    console.log(chalk.gray('  sql-env add       - Add a new environment'));
    console.log(chalk.gray('  sql-env remove    - Remove an environment'));
    console.log(chalk.gray('  sql-env list      - List all environments'));

    const { action } = await inquirer.prompt([
      {
        type: 'select',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: 'Skip (keep existing)', value: 'skip' },
          { name: 'Reinstall shell function', value: 'reinstall' },
          { name: 'Add more environments now', value: 'add' },
        ],
      },
    ]);

    if (action === 'skip') {
      console.log(chalk.gray('Keeping existing configuration.'));
      return true;
    }

    if (action === 'reinstall') {
      let content = removeBlock(existingContent, ENV_BLOCK_START, ENV_BLOCK_END);
      content = content.trimEnd() + generateEnvBlock();
      fs.writeFileSync(profilePath, content);
      console.log(chalk.green(`\n✓ sql-env reinstalled in ${profilePath}`));
      console.log(chalk.yellow('\n→ Run: source ' + profilePath + '  (or open a new terminal)'));
      return true;
    }

    // action === 'add' - fall through to add environments
  }

  console.log(chalk.blue('\nThis creates a sql-env function to switch between databases:\n'));
  console.log(chalk.gray('  sql-env local     # Switch to local Docker database'));
  console.log(chalk.gray('  sql-env stage     # Switch to staging'));
  console.log(chalk.gray('  sql-env prod-ro   # Switch to production (read-only)'));
  console.log(chalk.gray('  sql-env           # Show current environment\n'));
  console.log(chalk.blue('After setup, you can add more environments anytime with:\n'));
  console.log(chalk.gray('  sql-env add       # Interactive prompt to add environment'));
  console.log(chalk.gray('  sql-env remove    # Remove an environment\n'));
  console.log(chalk.gray('Passwords are stored securely in ~/' + CREDENTIALS_FILE + ' (mode 0600)\n'));

  // Collect initial configuration
  const configuredEnvs = [];

  // Load existing environments if any
  let existingEnvs = {};
  if (hasExistingConfig) {
    try {
      const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      existingEnvs = configData.environments || {};
    } catch (e) {
      // Ignore parse errors
    }
  }

  for (const envDef of DEFAULT_TEMPLATES) {
    // Skip if already configured
    if (existingEnvs[envDef.key]) {
      console.log(chalk.gray(`\n--- ${envDef.name} (already configured) ---`));
      continue;
    }

    const envConfig = await promptEnvironmentConfig(envDef);
    if (envConfig) configuredEnvs.push(envConfig);
  }

  // Check if we have anything to save
  const hasNewEnvs = configuredEnvs.length > 0;
  const hasAnyEnvs = hasNewEnvs || Object.keys(existingEnvs).length > 0;

  if (!hasAnyEnvs && !isConfigured) {
    console.log(chalk.yellow('\nNo environments configured. You can add them later with: sql-env add'));
  }

  // Always install the shell function if not present
  if (!isConfigured) {
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

    let content = removeBlock(existingContent, ENV_BLOCK_START, ENV_BLOCK_END);
    content = content.trimEnd() + generateEnvBlock();
    fs.writeFileSync(profilePath, content);
    console.log(chalk.green(`\n✓ sql-env function added to ${profilePath}`));
  }

  // Save new environments
  if (hasNewEnvs) {
    // Merge with existing config
    const allEnvs = { ...existingEnvs };
    for (const env of configuredEnvs) {
      allEnvs[env.key] = {
        name: env.name,
        server: env.server,
        user: env.user,
        database: env.database,
      };
    }
    fs.writeFileSync(configPath, JSON.stringify({ environments: allEnvs }, null, 2));
    console.log(chalk.green(`✓ Configuration saved to ~/${CONFIG_FILE}`));

    // Update credentials file - merge with existing
    const credsFile = path.join(os.homedir(), CREDENTIALS_FILE);
    let existingCreds = readFileSafe(credsFile);

    for (const env of configuredEnvs) {
      const varName = `SQL_ENV_${keyToVarName(env.key)}_PASSWORD`;
      // Remove old entry if exists
      existingCreds = existingCreds
        .split('\n')
        .filter((line) => !line.startsWith(`export ${varName}=`))
        .join('\n');
      // Add new entry
      const escapedPassword = env.password.replace(/'/g, "'\\''");
      existingCreds = existingCreds.trimEnd() + `\nexport ${varName}='${escapedPassword}'\n`;
    }

    writeFileSecure(credsFile, existingCreds.trim() + '\n', 0o600);
    console.log(chalk.green(`✓ Credentials saved to ~/${CREDENTIALS_FILE}`));

    // Summary
    console.log(chalk.blue('\n--- Configured Environments ---'));
    for (const env of configuredEnvs) {
      console.log(chalk.gray(`  ${env.key.padEnd(10)}`), chalk.white(`${env.server} (${env.user})`));
    }
  }

  console.log(chalk.yellow('\n→ Run: source ' + profilePath + '  (or open a new terminal)'));
  console.log(chalk.gray('Then use: sql-env <environment> to switch databases'));

  return true;
};
