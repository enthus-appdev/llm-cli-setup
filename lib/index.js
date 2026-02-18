// Main exports for llm-cli-setup package
export {
  installSqlcmd,
  configureSqlEnv,
  isSqlcmdInstalled,
  configureGitHubCli,
  isGhInstalled,
  isGhAuthenticated,
  getGhUser,
  configureAtlassianCli,
  isAtlInstalled,
  isAtlAuthenticated,
  ATL_CLI_REPO,
  configureN8nCli,
  isN8nInstalled,
  isN8nConfigured,
  N8N_CLI_REPO,
  configureGrafanaCli,
  isGrafanactlInstalled,
  isGrafanactlConfigured,
  getCurrentContext as getGrafanaContext,
  configureLogcli,
  isLogcliInstalled,
  configureM365Cli,
  isM365Installed,
  isM365Authenticated,
  getM365User,
  configureEsqCli,
  isEsqInstalled,
  isEsqConfigured,
  getEsqCurrentEnv,
  ESQ_CLI_REPO,
  configureDiscordCli,
  installDiscordctl,
  isDiscordctlInstalled,
  isDiscordctlConfigured,
  getDisplayName as getDiscordDisplayName,
  DISCORD_CLI_REPO,
} from './installers/index.js';

export {
  configureLlmTools,
  SUPPORTED_TOOLS,
  detectExistingConfig,
  BLOCK_START as LLM_BLOCK_START,
  BLOCK_END as LLM_BLOCK_END,
} from './llm/index.js';

export {
  commandExists,
  execCommand,
  detectPackageManager,
  getPlatformInfo,
  installPackage,
} from './utils/platform.js';

export {
  getShellProfile,
  hasBlock,
  removeBlock,
  replaceOrAppendBlock,
  ensureDir,
  readFileSafe,
  writeFileSecure,
} from './utils/shell.js';

// Combined setup function (matches environment-setup interface)
import chalk from 'chalk';
import inquirer from 'inquirer';
import {
  installSqlcmd,
  configureSqlEnv,
  isSqlcmdInstalled,
  configureGitHubCli,
  isGhInstalled,
  isGhAuthenticated,
  configureAtlassianCli,
  isAtlInstalled,
  isAtlAuthenticated,
  configureN8nCli,
  isN8nInstalled,
  isN8nConfigured,
  getCurrentInstance,
  configureGrafanaCli,
  isGrafanactlInstalled,
  isGrafanactlConfigured,
  getCurrentContext,
  configureLogcli,
  isLogcliInstalled,
  configureM365Cli,
  isM365Installed,
  isM365Authenticated,
  getM365User,
  configureEsqCli,
  isEsqInstalled,
  isEsqConfigured,
  getEsqCurrentEnv,
  configureDiscordCli,
  isDiscordctlInstalled,
  isDiscordctlConfigured,
  getDisplayName,
} from './installers/index.js';
import { configureLlmTools } from './llm/index.js';
import { getShellProfile } from './utils/shell.js';

/**
 * Available CLI tools configuration
 */
const CLI_TOOLS = [
  {
    id: 'sqlcmd',
    name: 'SQL Server (sqlcmd)',
    configure: async () => {
      await installSqlcmd();
      console.log();
      await configureSqlEnv();
    },
    getStatus: () => {
      if (!isSqlcmdInstalled()) return chalk.red('not installed');
      return chalk.green('installed');
    },
  },
  {
    id: 'gh',
    name: 'GitHub CLI (gh)',
    configure: configureGitHubCli,
    getStatus: () => {
      if (!isGhInstalled()) return chalk.red('not installed');
      if (!isGhAuthenticated()) return chalk.yellow('not authenticated');
      return chalk.green('authenticated');
    },
  },
  {
    id: 'atl',
    name: 'Atlassian CLI (atl)',
    configure: configureAtlassianCli,
    getStatus: () => {
      if (!isAtlInstalled()) return chalk.red('not installed');
      if (!isAtlAuthenticated()) return chalk.yellow('not authenticated');
      return chalk.green('authenticated');
    },
  },
  {
    id: 'n8n',
    name: 'n8n Workflow CLI (n8nctl)',
    configure: configureN8nCli,
    getStatus: () => {
      if (!isN8nInstalled()) return chalk.red('not installed');
      if (!isN8nConfigured()) return chalk.yellow('not configured');
      const instance = getCurrentInstance();
      return chalk.green(`configured (${instance || 'default'})`);
    },
  },
  {
    id: 'grafana',
    name: 'Grafana CLI (grafanactl)',
    configure: configureGrafanaCli,
    getStatus: () => {
      if (!isGrafanactlInstalled()) return chalk.red('not installed');
      if (!isGrafanactlConfigured()) return chalk.yellow('not configured');
      const ctx = getCurrentContext();
      return chalk.green(`configured (${ctx || 'default'})`);
    },
  },
  {
    id: 'logcli',
    name: 'Loki CLI (logcli)',
    configure: configureLogcli,
    getStatus: () => {
      if (!isLogcliInstalled()) return chalk.red('not installed');
      return chalk.green('installed');
    },
  },
  {
    id: 'm365',
    name: 'Microsoft 365 CLI (m365)',
    configure: configureM365Cli,
    getStatus: () => {
      if (!isM365Installed()) return chalk.red('not installed');
      if (!isM365Authenticated()) return chalk.yellow('not authenticated');
      const user = getM365User();
      return chalk.green(`authenticated${user ? ` (${user})` : ''}`);
    },
  },
  {
    id: 'esq',
    name: 'Elasticsearch CLI (esq)',
    configure: configureEsqCli,
    getStatus: () => {
      if (!isEsqInstalled()) return chalk.red('not installed');
      if (!isEsqConfigured()) return chalk.yellow('not configured');
      const env = getEsqCurrentEnv();
      return chalk.green(`configured (${env || 'default'})`);
    },
  },
  {
    id: 'discord',
    name: 'Discord CLI (discordctl)',
    configure: configureDiscordCli,
    getStatus: () => {
      if (!isDiscordctlInstalled()) return chalk.red('not installed');
      if (!isDiscordctlConfigured()) return chalk.yellow('not configured');
      const name = getDisplayName();
      return chalk.green(`configured${name ? ` (${name})` : ''}`);
    },
  },
  {
    id: 'llm',
    name: 'LLM Documentation (Claude/Gemini/Codex)',
    configure: configureLlmTools,
    getStatus: () => chalk.gray('always available'),
  },
];

/**
 * Main function to configure CLI tools with granular selection
 * @param {Object} [options]
 * @param {Object.<string, Function|{fn: Function, replace: boolean}>} [options.hooks] - Hooks keyed by tool id.
 *   Function → post-hook (runs after tool.configure()).
 *   { fn, replace: true } → replacement (runs instead of tool.configure()).
 */
export const configureShellEnv = async (options = {}) => {
  console.log(chalk.cyan('\n╔══════════════════════════════════════════╗'));
  console.log(chalk.cyan('║       CLI Tools Configuration            ║'));
  console.log(chalk.cyan('╚══════════════════════════════════════════╝\n'));

  // Show current status of all tools
  console.log(chalk.blue('Current status:\n'));
  for (const tool of CLI_TOOLS) {
    console.log(`  ${chalk.white(tool.name.padEnd(40))} ${tool.getStatus()}`);
  }
  console.log();

  // Ask user what to configure
  const { mode } = await inquirer.prompt([
    {
      type: 'select',
      name: 'mode',
      message: 'What would you like to do?',
      choices: [
        { name: 'Configure all tools', value: 'all' },
        { name: 'Select specific tools to configure', value: 'select' },
        { name: 'Cancel', value: 'cancel' },
      ],
    },
  ]);

  if (mode === 'cancel') {
    console.log(chalk.gray('\nCancelled.'));
    return;
  }

  let toolsToRun = CLI_TOOLS;

  if (mode === 'select') {
    const { selectedTools } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'selectedTools',
        message: 'Select tools to configure:',
        choices: CLI_TOOLS.map((tool) => ({
          name: `${tool.name} (${tool.getStatus()})`,
          value: tool.id,
          checked: false,
        })),
        validate: (answer) => {
          if (answer.length === 0) {
            return 'You must select at least one tool';
          }
          return true;
        },
      },
    ]);

    toolsToRun = CLI_TOOLS.filter((t) => selectedTools.includes(t.id));
  }

  // Run selected configurations
  for (let i = 0; i < toolsToRun.length; i++) {
    const tool = toolsToRun[i];
    const hook = options.hooks?.[tool.id];
    const isReplace = hook && typeof hook === 'object' && hook.replace;

    console.log(chalk.cyan(`\n=== Step ${i + 1}: ${tool.name} ===\n`));

    if (isReplace) {
      await hook.fn();
    } else {
      await tool.configure();
      if (typeof hook === 'function') {
        await hook();
      }
    }
  }

  // Final summary
  const { profilePath } = getShellProfile();

  console.log(chalk.cyan('\n=== Setup Complete ===\n'));
  console.log(chalk.yellow('To apply shell changes, either:'));
  console.log(chalk.gray(`  • Run: source ${profilePath}`));
  console.log(chalk.gray('  • Or restart your terminal'));
};
