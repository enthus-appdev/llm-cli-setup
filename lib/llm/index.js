import chalk from 'chalk';
import inquirer from 'inquirer';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ensureDir, readFileSafe, replaceOrAppendBlock } from '../utils/shell.js';

// Block markers for safe content injection
const BLOCK_START = '<!-- === CLI Tools === -->';
const BLOCK_END = '<!-- === End CLI Tools === -->';

// Global LLM tools we directly manage with block markers
const GLOBAL_LLM_TOOLS = [
  {
    name: 'Claude Code',
    dir: '.claude',
    file: 'CLAUDE.md',
  },
  {
    name: 'Gemini CLI',
    dir: '.gemini',
    file: 'GEMINI.md',
  },
  {
    name: 'OpenAI Codex CLI',
    dir: '.codex',
    file: 'CODEX.md',
  },
];

// Curated CLI tools documentation - focused on USAGE, not development
const CLI_TOOLS_DOCS = `## SQL Server Access (sqlcmd + sql-env)

### Environment Switching

Use \`sql-env\` to switch between database environments before running queries:

\`\`\`bash
sql-env              # Show current environment and available options
sql-env local        # Local Docker container (localhost,1433)
sql-env dev          # Development environment
sql-env stage        # Staging environment
sql-env prod-ro      # Production read-only
sql-env prod         # Production read-write (USE WITH CAUTION)
\`\`\`

### Running Queries

After switching environments, run sqlcmd without credentials:

\`\`\`bash
sqlcmd -Q "SELECT @@VERSION"
sqlcmd -d MyDatabase -Q "SELECT TOP 10 * FROM Users"
sqlcmd -i ./scripts/query.sql
\`\`\`

### Safety Rules

**CRITICAL**: Before executing any write operation (INSERT, UPDATE, DELETE, MERGE, TRUNCATE, DROP):
1. Check current environment: \`echo $SQL_ENV\`
2. Show the environment name and query to the user
3. Ask for explicit confirmation before executing

## GitHub CLI (gh)

### Authentication

\`\`\`bash
gh auth status    # Check authentication
gh auth login     # Re-authenticate if needed
\`\`\`

### Pull Requests

\`\`\`bash
gh pr create --base main --title "feat: Add new feature"
gh pr list --state open --author @me
gh pr view 123
gh pr checkout 123
gh pr merge 123 --squash
\`\`\`

### Issues

\`\`\`bash
gh issue list --label bug
gh issue view 456
gh issue create --title "Bug: ..." --label bug
\`\`\`

### Repository Operations

\`\`\`bash
gh repo view
gh repo clone owner/repo
\`\`\`

### API Access

\`\`\`bash
gh api repos/owner/repo/pulls/123/comments
\`\`\`

## Atlassian CLI (atl)

Command-line tool for Jira and Confluence. Use \`--json\` for structured output.

### Authentication

\`\`\`bash
atl auth status    # Check authentication
atl auth setup     # First-time OAuth setup (required once)
atl auth login     # Authenticate (opens browser)
\`\`\`

### Jira Issues

\`\`\`bash
# View and list
atl issue view PROJ-1234              # View issue details
atl issue view PROJ-1234 --json       # View as JSON
atl issue list --assignee @me         # Your assigned issues
atl issue list --jql "status = Open"  # Custom JQL query

# Create and edit
atl issue create --project PROJ --type Bug --summary "Title"
atl issue edit PROJ-1234 --summary "New summary"
atl issue edit PROJ-1234 --assignee @me

# Workflow
atl issue transition PROJ-1234 "In Progress"
atl issue comment PROJ-1234 --body "Comment text"

# Board sorting / ranking
atl issue list --jql 'project = PROJ AND statusCategory = Done ORDER BY statuscategorychangedate DESC' --limit 50 --json
atl board rank PROJ-124 PROJ-125 --after PROJ-123 --board-id <board-id>  # Rank relative to another issue
\`\`\`

**Board ranking tips**:
- Use \`--after\` or \`--before\` to establish relative order within columns (not \`--top\` which only affects backlog)
- 50 issue limit per rank call (batch if needed)
- Use \`statuscategorychangedate\` for "when moved to Done" (not \`updated\` or \`resolutiondate\`)
- Use \`statusCategory = Done\` for locale-agnostic queries (status names like "Erledigt" vary by language)

### Confluence

\`\`\`bash
# Spaces
atl confluence space list                   # List all spaces
atl confluence space list --all             # Fetch all (follows pagination)

# View pages
atl confluence page view <id>               # View by ID
atl confluence page view -s DOCS -t "Title" # View by space + exact title
atl confluence page view <id> --raw         # Get storage format (XHTML)
atl confluence page view <id> --web         # Open in browser

# List pages
atl confluence page list -s DOCS            # List pages in space
atl confluence page list -s DOCS --status draft     # List drafts
atl confluence page list -s DOCS --status archived  # List archived
atl confluence page list -s DOCS --all      # Fetch all pages

# Search (uses v1 API - different scopes than v2)
atl confluence page search -q "term"        # Search by title
atl confluence page search -q "term" -s DOCS  # Search within space
atl confluence page search --cql "ancestor = <id>"   # Search in hierarchy
atl confluence page search --cql "parent = <id>"     # Direct children only
atl confluence page search --cql "type = page AND text ~ 'keyword'"

# Create and edit
atl confluence page create -s DOCS -t "Title" -b "<p>Content</p>"
atl confluence page create -s DOCS -t "Title" --parent <id>  # Child page
atl confluence page create -s DOCS -t "Title" --draft        # Create as draft
atl confluence page edit <id> --title "New Title"
atl confluence page edit <id> --body "<p>New content</p>"

# Hierarchy navigation
atl confluence page children <id>              # List immediate children
atl confluence page children <id> --descendants  # All descendants with depth
atl confluence page children <id> --type folder  # Only folders
atl confluence page children <id> --type page    # Only pages

# Move pages
atl confluence page move <id> --target <parent-id>  # Move as child of target
atl confluence page move <id> --target <id> --position before  # Reorder siblings
atl confluence page move <id> --target <id> --position after
atl confluence page move <id> --space NEWSPACE  # Move to different space

# Archive and delete
atl confluence page archive <id>            # Archive (reversible)
atl confluence page archive <id> --unarchive  # Restore archived page
atl confluence page delete <id> --force     # Delete (skip confirmation)
atl confluence page publish <id>            # Publish draft
\`\`\`

**API version notes**:
- Most operations use v2 API (cursor pagination, max 250/page)
- Search, archive, and move use v1 API (offset pagination, different OAuth scopes)
- \`--all\` flag handles pagination automatically for list commands

**Tips**:
- Prefer page IDs over title search - titles require exact match and \`--space\`
- Use \`--raw\` to get storage format (XHTML with macros) for backup/migration
- Use \`children --descendants\` to map full page tree with depth levels
- Archive is reversible, delete is not - prefer archive when unsure

### Folder Operations

Folders are distinct from pages (containers without content, not pages with children).

**Supported operations**:
- List: \`children --type folder\` to find folders
- Move: \`page move\` works for folders (auto-detects type)
- Delete: \`page delete\` works (needs \`delete:folder:confluence\` scope)

**Not supported**:
- Create: No folder creation endpoint in Atlassian API
- Rename: No PUT endpoint exists in Atlassian API

**To rename a folder** (workaround - create new, move children, delete old):
\`\`\`bash
# Create new page that will become the folder
atl confluence page create -s DOCS --parent <parent-id> -t "New Name" -b "<p>Folder</p>"
# Move each child to new parent
atl confluence page move <child-id> --target <new-folder-id>
# Delete old folder
atl confluence page delete <old-folder-id> --force
\`\`\`

### Jira Formatting (Wiki Markup)

Jira uses wiki markup, NOT Markdown:

\`\`\`
h1. Heading 1
*bold text*
_italic text_
* Bullet list
# Numbered list
{code}code block{code}
[Link text|https://example.com]
||Header||
|Cell|
\`\`\`

**Note**: Comments render as plain text only - wiki markup does NOT work in comments.

### Confluence Formatting (HTML)

Confluence page bodies must be HTML:

\`\`\`html
<h1>Heading</h1>
<p>Paragraph with <strong>bold</strong>.</p>
<ul><li>Bullet</li></ul>
\`\`\`

For code blocks, use Confluence macro:

\`\`\`html
<ac:structured-macro ac:name="code">
  <ac:plain-text-body><![CDATA[code here]]></ac:plain-text-body>
</ac:structured-macro>
\`\`\`

**Important**: The \`--body\` flag replaces the ENTIRE page content.`;

/**
 * Generate the CLI tools block with markers
 */
const generateCliToolsBlock = () => {
  return `${BLOCK_START}
# CLI Tools

This document provides instructions for using CLI tools available in this development environment.

${CLI_TOOLS_DOCS}
${BLOCK_END}`;
};

/**
 * Check if any LLM config has CLI tools block
 */
const detectExistingConfig = () => {
  for (const tool of GLOBAL_LLM_TOOLS) {
    const configPath = path.join(os.homedir(), tool.dir, tool.file);
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf8');
      if (content.includes(BLOCK_START)) {
        return { hasCliTools: true, toolName: tool.name };
      }
    }
  }
  return { hasCliTools: false, toolName: null };
};

/**
 * Inject CLI tools documentation into a single LLM config file
 * Uses block markers to safely preserve existing user content
 */
const injectToLlmConfig = (tool) => {
  const configDir = path.join(os.homedir(), tool.dir);
  const configPath = path.join(configDir, tool.file);

  // Ensure directory exists
  ensureDir(configDir);

  // Read existing content (empty string if file doesn't exist)
  const existingContent = readFileSafe(configPath);

  // Generate the new block
  const cliToolsBlock = generateCliToolsBlock();

  // Replace or append the block (preserves all other content)
  const newContent = replaceOrAppendBlock(existingContent, BLOCK_START, BLOCK_END, cliToolsBlock);

  // Write back
  fs.writeFileSync(configPath, newContent);

  return configPath;
};

/**
 * List of supported AI tools for display
 */
const SUPPORTED_TOOLS = [
  { name: 'Claude Code', config: '~/.claude/CLAUDE.md' },
  { name: 'Gemini CLI', config: '~/.gemini/GEMINI.md' },
  { name: 'OpenAI Codex CLI', config: '~/.codex/CODEX.md' },
];

/**
 * Configure LLM tools with block-based content injection
 * Safely preserves existing user content outside the CLI Tools block
 */
export const configureLlmTools = async () => {
  console.log(chalk.cyan('\n=== LLM Configuration ===\n'));
  console.log(chalk.blue('Configure CLI tools documentation for your AI coding assistants.'));
  console.log(chalk.gray('This teaches LLMs how to use sqlcmd, sql-env, gh, and atl.\n'));

  // Show supported tools
  console.log(chalk.blue('Supported AI tools:'));
  for (const tool of SUPPORTED_TOOLS) {
    console.log(chalk.gray(`  • ${tool.name} → ${tool.config}`));
  }
  console.log();

  console.log(chalk.gray('Your existing configuration will be preserved.'));
  console.log(chalk.gray(`CLI tools docs are injected between ${BLOCK_START} markers.\n`));

  // Check existing configuration
  const { hasCliTools, toolName } = detectExistingConfig();

  if (hasCliTools) {
    console.log(chalk.yellow(`! CLI tools block already exists in ${toolName}`));
    const { action } = await inquirer.prompt([
      {
        type: 'select',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: 'Update CLI tools documentation (preserves your other content)', value: 'update' },
          { name: 'Skip', value: 'skip' },
        ],
      },
    ]);

    if (action === 'skip') {
      console.log(chalk.gray('Skipping LLM configuration.'));
      return true;
    }
  }

  // Confirm setup
  const { proceed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'proceed',
      message: hasCliTools
        ? 'Update CLI tools documentation in all AI assistant configs?'
        : 'Add CLI tools documentation to your AI assistant configs?',
      default: true,
    },
  ]);

  if (!proceed) {
    console.log(chalk.gray('Skipping LLM configuration.'));
    return true;
  }

  // Inject to all configured LLM tools
  console.log(chalk.blue('\nInjecting CLI tools documentation...'));

  let hasErrors = false;
  for (const tool of GLOBAL_LLM_TOOLS) {
    try {
      const configPath = injectToLlmConfig(tool);
      console.log(chalk.green(`  ✓ ${tool.name}: ${configPath}`));
    } catch (error) {
      console.log(chalk.red(`  ✗ ${tool.name}: ${error.message}`));
      hasErrors = true;
    }
  }

  if (hasErrors) {
    console.log(chalk.yellow('\n! LLM configuration completed with errors'));
    return false;
  }

  console.log(chalk.green('\n✓ LLM configuration complete'));
  console.log(chalk.gray('Your AI assistants now know how to use sqlcmd, sql-env, gh, and atl!'));

  return true;
};

/**
 * Export for direct access
 */
export { SUPPORTED_TOOLS, detectExistingConfig, BLOCK_START, BLOCK_END };
