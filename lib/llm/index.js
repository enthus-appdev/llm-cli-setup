import chalk from 'chalk';
import inquirer from 'inquirer';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { ensureDir, readFileSafe, replaceOrAppendBlock } from '../utils/shell.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BLOCK_START_CLAUDE = '<!-- === CLI Tools === -->';
const BLOCK_END_CLAUDE = '<!-- === End CLI Tools === -->';
const BLOCK_START_CODEX = '# === CLI Tools ===';
const BLOCK_END_CODEX = '# === End CLI Tools ===';

/**
 * LLM tool configurations
 */
const LLM_TOOLS = {
  claude: {
    name: 'Claude Code',
    configPath: () => path.join(os.homedir(), '.claude', 'CLAUDE.md'),
    templateFile: 'claude-tools.md',
    blockStart: BLOCK_START_CLAUDE,
    blockEnd: BLOCK_END_CLAUDE,
    description: 'Adds CLI tools documentation to ~/.claude/CLAUDE.md',
    createWrapper: (content) => content, // Template already has markers
  },
  codex: {
    name: 'OpenAI Codex CLI',
    configPath: () => path.join(os.homedir(), '.codex', 'AGENTS.md'),
    templateFile: 'codex-tools.md',
    blockStart: BLOCK_START_CODEX,
    blockEnd: BLOCK_END_CODEX,
    description: 'Adds CLI tools documentation to ~/.codex/AGENTS.md',
    createWrapper: (content) => `${BLOCK_START_CODEX}\n${content}\n${BLOCK_END_CODEX}`,
  },
};

/**
 * Get template content from templates directory
 */
const getTemplateContent = (templateFile) => {
  // Try relative to this file first (for installed package)
  let templatePath = path.join(__dirname, '..', '..', 'templates', templateFile);

  if (!fs.existsSync(templatePath)) {
    // Fallback for development
    templatePath = path.join(process.cwd(), 'templates', templateFile);
  }

  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found: ${templateFile}`);
  }

  return fs.readFileSync(templatePath, 'utf8');
};

/**
 * Check if an LLM tool is installed/configured
 */
const detectLlmTool = (tool) => {
  const config = LLM_TOOLS[tool];
  const configPath = config.configPath();
  const configDir = path.dirname(configPath);

  return {
    dirExists: fs.existsSync(configDir),
    fileExists: fs.existsSync(configPath),
    hasBlock: fs.existsSync(configPath) &&
              readFileSafe(configPath).includes(config.blockStart),
  };
};

/**
 * Configure a single LLM tool
 */
const configureLlmTool = async (toolKey) => {
  const tool = LLM_TOOLS[toolKey];
  const configPath = tool.configPath();
  const configDir = path.dirname(configPath);
  const detection = detectLlmTool(toolKey);

  console.log(chalk.cyan(`\n--- ${tool.name} ---`));
  console.log(chalk.gray(tool.description));
  console.log(chalk.gray(`Config: ${configPath}`));

  // Check current state
  if (detection.hasBlock) {
    console.log(chalk.yellow('! CLI tools section already exists'));

    const { action } = await inquirer.prompt([
      {
        type: 'select',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: 'Update existing section', value: 'update' },
          { name: 'Skip', value: 'skip' },
        ],
      },
    ]);

    if (action === 'skip') {
      console.log(chalk.gray('Keeping existing configuration.'));
      return true;
    }
  } else if (!detection.dirExists) {
    const { create } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'create',
        message: `${tool.name} config directory doesn't exist. Create it?`,
        default: true,
      },
    ]);

    if (!create) {
      console.log(chalk.gray('Skipping.'));
      return false;
    }
  }

  // Ensure directory exists
  ensureDir(configDir);

  // Get template content
  let templateContent;
  try {
    templateContent = getTemplateContent(tool.templateFile);
  } catch (error) {
    console.error(chalk.red(`✗ ${error.message}`));
    return false;
  }

  // Prepare content with wrapper if needed
  const blockContent = tool.createWrapper(templateContent);

  // Read existing content or create new
  let existingContent = readFileSafe(configPath);

  if (!existingContent) {
    // Create new file with header
    existingContent = `# ${tool.name} Configuration\n\nThis file contains configuration for ${tool.name}.\n`;
  }

  // Update or append block
  const newContent = replaceOrAppendBlock(
    existingContent,
    tool.blockStart,
    tool.blockEnd,
    blockContent
  );

  fs.writeFileSync(configPath, newContent);
  console.log(chalk.green(`✓ Updated ${configPath}`));

  return true;
};

/**
 * Configure all LLM tools
 */
export const configureLlmTools = async () => {
  console.log(chalk.cyan('\n=== LLM Configuration ===\n'));
  console.log(chalk.blue('Configure CLI tools documentation for your AI coding assistants.'));
  console.log(chalk.gray('This teaches LLMs how to use sqlcmd, gh, and atl commands.\n'));

  // Detect which tools are potentially available
  const toolStatus = Object.entries(LLM_TOOLS).map(([key, tool]) => {
    const detection = detectLlmTool(key);
    return {
      key,
      name: tool.name,
      detected: detection.dirExists || detection.fileExists,
      configured: detection.hasBlock,
    };
  });

  // Show detection results
  console.log(chalk.blue('Detected LLM tools:'));
  for (const status of toolStatus) {
    const icon = status.configured ? '✓' : status.detected ? '○' : '·';
    const color = status.configured ? chalk.green : status.detected ? chalk.yellow : chalk.gray;
    console.log(color(`  ${icon} ${status.name}`));
  }
  console.log();

  // Let user select which to configure
  const { selectedTools } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'selectedTools',
      message: 'Which LLM tools do you want to configure?',
      choices: toolStatus.map((s) => ({
        name: `${s.name}${s.configured ? ' (update)' : ''}`,
        value: s.key,
        checked: true,
      })),
    },
  ]);

  if (selectedTools.length === 0) {
    console.log(chalk.yellow('No tools selected.'));
    return;
  }

  // Configure each selected tool
  for (const toolKey of selectedTools) {
    await configureLlmTool(toolKey);
  }

  console.log(chalk.green('\n✓ LLM configuration complete'));
};

/**
 * Export individual tool configs for direct access
 */
export { LLM_TOOLS, detectLlmTool };
