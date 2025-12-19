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
} from './installers/index.js';

export { configureLlmTools, LLM_TOOLS, detectLlmTool } from './llm/index.js';

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
import { installSqlcmd, configureSqlEnv } from './installers/sqlcmd.js';
import { configureGitHubCli } from './installers/gh.js';
import { configureAtlassianCli } from './installers/atl.js';
import { configureLlmTools } from './llm/index.js';
import { getShellProfile } from './utils/shell.js';
import chalk from 'chalk';

/**
 * Main function to configure all CLI tools
 * This matches the interface expected by environment-setup
 */
export const configureShellEnv = async () => {
  console.log(chalk.cyan('\n╔══════════════════════════════════════════╗'));
  console.log(chalk.cyan('║       CLI Tools Configuration            ║'));
  console.log(chalk.cyan('╚══════════════════════════════════════════╝\n'));

  // Step 1: SQL Environment Switcher
  console.log(chalk.cyan('=== Step 1: SQL Environment Switcher ===\n'));
  await installSqlcmd();
  console.log();
  await configureSqlEnv();

  // Step 2: GitHub CLI
  await configureGitHubCli();

  // Step 3: Atlassian CLI
  await configureAtlassianCli();

  // Step 4: LLM Configuration
  await configureLlmTools();

  // Final summary
  const { profilePath } = getShellProfile();

  console.log(chalk.cyan('\n=== Setup Complete ===\n'));
  console.log(chalk.yellow('To apply shell changes, either:'));
  console.log(chalk.gray(`  • Run: source ${profilePath}`));
  console.log(chalk.gray('  • Or restart your terminal'));
  console.log();
  console.log(chalk.blue('Available commands:'));
  console.log(chalk.cyan('  sql-env              # Show/switch SQL environment'));
  console.log(chalk.cyan('  sqlcmd -Q "..."      # Run SQL query'));
  console.log(chalk.cyan('  gh pr list           # List GitHub pull requests'));
  console.log(chalk.cyan('  atl issue list       # List Jira issues'));
  console.log(chalk.cyan('  atl issue view NX-1  # View Jira issue'));
};
