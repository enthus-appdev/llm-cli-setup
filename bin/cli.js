#!/usr/bin/env node

import chalk from 'chalk';
import inquirer from 'inquirer';

import { installSqlcmd, configureSqlEnv } from '../lib/installers/sqlcmd.js';
import { configureGitHubCli } from '../lib/installers/gh.js';
import { configureAtlassianCli } from '../lib/installers/atl.js';
import { configureLlmTools } from '../lib/llm/index.js';
import { getShellProfile } from '../lib/utils/shell.js';

const VERSION = '1.0.0';

/**
 * Print header banner
 */
const printHeader = () => {
  console.log(chalk.cyan(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   ${chalk.white.bold('Developer CLI Tools Setup')}                           ║
║   ${chalk.gray(`v${VERSION}`)}                                                ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`));
};

/**
 * Run full setup wizard
 */
const runFullSetup = async () => {
  console.log(chalk.blue('Running full setup...\n'));
  console.log(chalk.gray('This will configure all CLI tools and LLM integrations.\n'));

  // Step 1: sqlcmd + sql-env
  console.log(chalk.cyan.bold('\n[1/4] SQL Server Tools'));
  await installSqlcmd();
  await configureSqlEnv();

  // Step 2: GitHub CLI
  console.log(chalk.cyan.bold('\n[2/4] GitHub CLI'));
  await configureGitHubCli();

  // Step 3: Atlassian CLI
  console.log(chalk.cyan.bold('\n[3/4] Atlassian CLI'));
  await configureAtlassianCli();

  // Step 4: LLM Configuration
  console.log(chalk.cyan.bold('\n[4/4] LLM Configuration'));
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
        { name: '🗄️  Configure SQL tools (sqlcmd + sql-env)', value: 'sql' },
        { name: '🐙 Configure GitHub CLI', value: 'gh' },
        { name: '📋 Configure Atlassian CLI', value: 'atl' },
        { name: '🤖 Configure LLM tools (Claude Code, Codex)', value: 'llm' },
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
        default: false,
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
  const { shell, profilePath } = getShellProfile();

  console.log(chalk.cyan('\n═══════════════════════════════════════════════════════════'));
  console.log(chalk.cyan.bold('                     Setup Complete!'));
  console.log(chalk.cyan('═══════════════════════════════════════════════════════════\n'));

  console.log(chalk.yellow('To apply shell changes, run:'));
  console.log(chalk.white(`  source ${profilePath}`));
  console.log(chalk.gray('  (or restart your terminal)\n'));

  console.log(chalk.blue('Available commands:'));
  console.log(chalk.gray('  sql-env              # Show/switch SQL environment'));
  console.log(chalk.gray('  sqlcmd -Q "..."      # Run SQL query'));
  console.log(chalk.gray('  gh pr list           # List GitHub PRs'));
  console.log(chalk.gray('  atl issue list       # List Jira issues'));
  console.log();
};

/**
 * Parse command line arguments
 */
const parseArgs = () => {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
${chalk.bold('Developer CLI Tools Setup')} v${VERSION}

${chalk.bold('Usage:')}
  dev-cli-setup              Interactive menu
  dev-cli-setup --full       Run full setup (non-interactive prompts still shown)
  dev-cli-setup --sql        Configure SQL tools only
  dev-cli-setup --gh         Configure GitHub CLI only
  dev-cli-setup --atl        Configure Atlassian CLI only
  dev-cli-setup --llm        Configure LLM tools only

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
