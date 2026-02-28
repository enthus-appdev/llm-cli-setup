#!/usr/bin/env node

import chalk from 'chalk';
import inquirer from 'inquirer';
import { createRequire } from 'module';

import { installSqlcmd, configureSqlEnv } from '../lib/installers/sqlcmd.js';
import { configureGitHubCli } from '../lib/installers/gh.js';
import { configureAtlassianCli } from '../lib/installers/atl.js';
import { configureN8nCli } from '../lib/installers/n8n.js';
import { configureGrafanaCli } from '../lib/installers/grafanactl.js';
import { configureLogcli } from '../lib/installers/logcli.js';
import { configureM365Cli } from '../lib/installers/m365.js';
import { configureEsqCli } from '../lib/installers/esq.js';
import { configureDiscordCli } from '../lib/installers/discord.js';
import { configurePlaywright } from '../lib/installers/playwright.js';
import { configureLlmTools } from '../lib/llm/index.js';
import { getShellProfile } from '../lib/utils/shell.js';

const require = createRequire(import.meta.url);
const { version: VERSION } = require('../package.json');

/**
 * Print header banner
 */
const printHeader = () => {
  const boxWidth = 59; // Width between the two ║ characters
  const title = 'LLM CLI Setup';
  const version = `v${VERSION}`;
  const prefix = '   ';

  console.log(chalk.cyan('╔' + '═'.repeat(boxWidth) + '╗'));
  console.log(chalk.cyan('║') + ' '.repeat(boxWidth) + chalk.cyan('║'));
  console.log(
    chalk.cyan('║') +
      prefix +
      chalk.white.bold(title) +
      ' '.repeat(boxWidth - prefix.length - title.length) +
      chalk.cyan('║')
  );
  console.log(
    chalk.cyan('║') +
      prefix +
      chalk.gray(version) +
      ' '.repeat(boxWidth - prefix.length - version.length) +
      chalk.cyan('║')
  );
  console.log(chalk.cyan('║') + ' '.repeat(boxWidth) + chalk.cyan('║'));
  console.log(chalk.cyan('╚' + '═'.repeat(boxWidth) + '╝'));
  console.log();
};

/**
 * Run full setup wizard
 */
const runFullSetup = async () => {
  console.log(chalk.blue('Running full setup...\n'));
  console.log(chalk.gray('This will configure all CLI tools and LLM integrations.\n'));

  // Step 1: sqlcmd
  console.log(chalk.cyan.bold('\n[1/11] SQL Server Tools'));
  await installSqlcmd();
  await configureSqlEnv();

  // Step 2: GitHub CLI
  console.log(chalk.cyan.bold('\n[2/11] GitHub CLI'));
  await configureGitHubCli();

  // Step 3: Atlassian CLI
  console.log(chalk.cyan.bold('\n[3/11] Atlassian CLI'));
  await configureAtlassianCli();

  // Step 4: n8n CLI
  console.log(chalk.cyan.bold('\n[4/11] n8n CLI'));
  await configureN8nCli();

  // Step 5: Grafana CLI
  console.log(chalk.cyan.bold('\n[5/11] Grafana CLI'));
  await configureGrafanaCli();

  // Step 6: Loki CLI
  console.log(chalk.cyan.bold('\n[6/11] Loki CLI'));
  await configureLogcli();

  // Step 7: Microsoft 365 CLI
  console.log(chalk.cyan.bold('\n[7/11] Microsoft 365 CLI'));
  await configureM365Cli();

  // Step 8: Elasticsearch Query CLI
  console.log(chalk.cyan.bold('\n[8/11] Elasticsearch Query CLI'));
  await configureEsqCli();

  // Step 9: Discord CLI
  console.log(chalk.cyan.bold('\n[9/11] Discord CLI'));
  await configureDiscordCli();

  // Step 10: Playwright
  console.log(chalk.cyan.bold('\n[10/11] Playwright'));
  await configurePlaywright();

  // Step 11: LLM Configuration
  console.log(chalk.cyan.bold('\n[11/11] LLM Configuration'));
  await configureLlmTools();

  // Final summary
  printSummary();
};

/**
 * Interactive menu
 */
const runMenu = async () => {
  const { action } = await inquirer.prompt([
    {
      type: 'select',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { name: '🚀 Full Setup (recommended for first-time users)', value: 'full' },
        new inquirer.Separator(),
        { name: '🗄️  Configure SQL tools (sqlcmd contexts)', value: 'sql' },
        { name: '🐙 Configure GitHub CLI', value: 'gh' },
        { name: '📋 Configure Atlassian CLI', value: 'atl' },
        { name: '🔄 Configure n8n CLI', value: 'n8n' },
        { name: '📊 Configure Grafana CLI', value: 'grafana' },
        { name: '📜 Configure Loki CLI (logcli)', value: 'logcli' },
        { name: '☁️  Configure Microsoft 365 CLI', value: 'm365' },
        { name: '🔍 Configure Elasticsearch CLI (esq)', value: 'esq' },
        { name: '💬 Configure Discord CLI', value: 'discord' },
        { name: '🎭 Configure Playwright (browser automation)', value: 'playwright' },
        { name: '🤖 Configure AI assistants (Claude Code, Gemini CLI, Codex CLI)', value: 'llm' },
        new inquirer.Separator(),
        { name: '❌ Exit', value: 'exit' },
      ],
    },
  ]);

  switch (action) {
    case 'full':
      await runFullSetup();
      break;
    case 'sql':
      await installSqlcmd();
      await configureSqlEnv();
      printSummary();
      break;
    case 'gh':
      await configureGitHubCli();
      break;
    case 'atl':
      await configureAtlassianCli();
      break;
    case 'n8n':
      await configureN8nCli();
      break;
    case 'grafana':
      await configureGrafanaCli();
      break;
    case 'logcli':
      await configureLogcli();
      break;
    case 'm365':
      await configureM365Cli();
      break;
    case 'esq':
      await configureEsqCli();
      break;
    case 'discord':
      await configureDiscordCli();
      break;
    case 'playwright':
      await configurePlaywright();
      break;
    case 'llm':
      await configureLlmTools();
      break;
    case 'exit':
      console.log(chalk.gray('\nGoodbye!\n'));
      process.exit(0);
  }

  // Return to menu unless exiting
  if (action !== 'exit') {
    console.log();
    const { continue: shouldContinue } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'continue',
        message: 'Return to menu?',
        default: true,
      },
    ]);

    if (shouldContinue) {
      await runMenu();
    }
  }
};

/**
 * Print final summary
 */
const printSummary = () => {
  const { profilePath } = getShellProfile();

  console.log(chalk.cyan('\n═══════════════════════════════════════════════════════════'));
  console.log(chalk.cyan.bold('                     Setup Complete!'));
  console.log(chalk.cyan('═══════════════════════════════════════════════════════════\n'));

  console.log(chalk.yellow('To apply shell changes, run:'));
  console.log(chalk.white(`  source ${profilePath}`));
  console.log(chalk.gray('  (or restart your terminal)'));
};

/**
 * Parse command line arguments
 */
const parseArgs = () => {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
${chalk.bold('LLM CLI Setup')} v${VERSION}

${chalk.bold('Usage:')}
  llm-cli-setup              Interactive menu
  llm-cli-setup --full       Run full setup (non-interactive prompts still shown)
  llm-cli-setup --sql        Configure SQL tools only
  llm-cli-setup --gh         Configure GitHub CLI only
  llm-cli-setup --atl        Configure Atlassian CLI only
  llm-cli-setup --n8n        Configure n8n CLI only
  llm-cli-setup --grafana    Configure Grafana CLI only
  llm-cli-setup --logcli     Configure Loki CLI only
  llm-cli-setup --m365       Configure Microsoft 365 CLI only
  llm-cli-setup --esq        Configure Elasticsearch CLI only
  llm-cli-setup --discord    Configure Discord CLI only
  llm-cli-setup --playwright Configure Playwright only
  llm-cli-setup --llm        Configure LLM tools only

${chalk.bold('Options:')}
  -h, --help                    Show this help message
  -v, --version                 Show version number
`);
    process.exit(0);
  }

  if (args.includes('--version') || args.includes('-v')) {
    console.log(VERSION);
    process.exit(0);
  }

  return {
    full: args.includes('--full'),
    sql: args.includes('--sql'),
    gh: args.includes('--gh'),
    atl: args.includes('--atl'),
    n8n: args.includes('--n8n'),
    grafana: args.includes('--grafana'),
    logcli: args.includes('--logcli'),
    m365: args.includes('--m365'),
    esq: args.includes('--esq'),
    discord: args.includes('--discord'),
    playwright: args.includes('--playwright'),
    llm: args.includes('--llm'),
  };
};

/**
 * Main entry point
 */
const main = async () => {
  printHeader();

  const args = parseArgs();

  try {
    if (args.full) {
      await runFullSetup();
    } else if (args.sql) {
      await installSqlcmd();
      await configureSqlEnv();
      printSummary();
    } else if (args.gh) {
      await configureGitHubCli();
    } else if (args.atl) {
      await configureAtlassianCli();
    } else if (args.n8n) {
      await configureN8nCli();
    } else if (args.grafana) {
      await configureGrafanaCli();
    } else if (args.logcli) {
      await configureLogcli();
    } else if (args.m365) {
      await configureM365Cli();
    } else if (args.esq) {
      await configureEsqCli();
    } else if (args.discord) {
      await configureDiscordCli();
    } else if (args.playwright) {
      await configurePlaywright();
    } else if (args.llm) {
      await configureLlmTools();
    } else {
      // Interactive menu
      await runMenu();
    }
  } catch (error) {
    if (error.name === 'ExitPromptError') {
      // User pressed Ctrl+C
      console.log(chalk.gray('\n\nSetup cancelled.\n'));
      process.exit(0);
    }
    throw error;
  }

  console.log(chalk.gray('Done.\n'));
};

main().catch((error) => {
  console.error(chalk.red(`\nError: ${error.message}\n`));
  process.exit(1);
});
