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
    commands: ['sqlcmd config use-context', 'sqlcmd query'],
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
    commands: ['gh pr list', 'gh issue list'],
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
    commands: ['atl issue view PROJ-123', 'atl confluence page view <id>'],
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
    commands: ['n8nctl workflow list', 'n8nctl workflow pull <id> -r'],
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
    commands: ['grafanactl resources list', 'grafanactl resources get dashboards'],
  },
  {
    id: 'llm',
    name: 'LLM Documentation (Claude/Gemini/Codex)',
    configure: configureLlmTools,
    getStatus: () => chalk.gray('always available'),
    commands: [],
  },
];

/**
 * Main function to configure CLI tools with granular selection
 */
export const configureShellEnv = async () => {
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
    console.log(chalk.cyan(`\n=== Step ${i + 1}: ${tool.name} ===\n`));
    await tool.configure();
  }

  // Final summary
  const { profilePath } = getShellProfile();
  const configuredCommands = toolsToRun.flatMap((t) => t.commands).filter(Boolean);

  console.log(chalk.cyan('\n=== Setup Complete ===\n'));
  console.log(chalk.yellow('To apply shell changes, either:'));
  console.log(chalk.gray(`  • Run: source ${profilePath}`));
  console.log(chalk.gray('  • Or restart your terminal'));

  if (configuredCommands.length > 0) {
    console.log();
    console.log(chalk.blue('Available commands:'));
    for (const cmd of configuredCommands) {
      console.log(chalk.cyan(`  ${cmd}`));
    }
  }
};
