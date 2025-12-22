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
sql-env <name>       # Switch to environment (e.g., sql-env dev)
sql-env add          # Add a new environment (interactive prompts)
sql-env remove <name> # Remove an environment
sql-env list         # List all configured environments
\`\`\`

Common environment names: local, dev, stage, prod-ro, prod

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
atl confluence page archive <id>            # Archive page
atl confluence page delete <id> --force     # Delete (skip confirmation)
atl confluence page publish <id>            # Publish draft

# Templates (v1 API - requires Space Admin or Confluence Admin)
atl confluence template view <id>           # View template
atl confluence template view <id> --raw     # View raw storage format
atl confluence template create -s DOCS --name "Meeting Notes" --body "<h1>Notes</h1>"
atl confluence template create --name "Global Template" --body "<p>Content</p>"  # Global (admin only)
atl confluence template update <id> --name "New Name" --body "<p>Updated</p>"
\`\`\`

**API version notes**:
- Most operations use v2 API (cursor pagination, max 250/page)
- Search, archive, move, and templates use v1 API (offset pagination, different OAuth scopes)
- Some v1 endpoints return 410 Gone (unarchive removed - use web UI)
- \`--all\` flag handles pagination automatically for list commands

**Tips**:
- Prefer page IDs over title search - titles require exact match and \`--space\`
- Use \`--raw\` to get storage format (XHTML with macros) for backup/migration
- Use \`children --descendants\` to map full page tree with depth levels
- Archive is reversible (via web UI only - no restore API), delete is not
- Delete returning 404? Could be permission denied - Confluence returns 404 for both "not found" and "no permission". Verify page exists with search first.

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

### Jira Formatting (Plain Text)

Jira Cloud's new editor does NOT render wiki markup or Markdown. Use plain text formatting:

\`\`\`
Short summary of the task.

GOALS
- Goal 1
- Goal 2

IMPLEMENTATION
- What was done
- Technical details

NOTES
Any additional context. URLs auto-link: https://github.com/example
\`\`\`

**Formatting tips:**
- ALL CAPS for section headers (renders cleanly, easy to scan)
- Dashes for bullet points
- Blank lines between sections
- URLs auto-link, no special syntax needed
- Comments are also plain text only

### Jira Workflow Transitions (German)

Common transition names in our Jira instance:
- "In Entwicklung" - In Development
- "Bereit für Überprüfung" - Ready for Review
- "In Überprüfung" - In Review
- "Erledigt" - Done

Use \`atl issue transition PROJ-123 --list\` to see available transitions.

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

**Important**: The \`--body\` flag replaces the ENTIRE page content.

## n8n Workflow CLI (n8nctl)

CLI for managing n8n workflows - pull/push for version control, execute workflows, and manage multiple instances.

### Configuration

\`\`\`bash
n8nctl config init                    # Interactive setup
n8nctl config init --name prod --url https://n8n.example.com --api-key KEY
n8nctl config list                    # List configured instances (* = active)
n8nctl config use <name>              # Switch active instance
n8nctl config remove <name>           # Remove instance
\`\`\`

### Workflows

\`\`\`bash
# List and view
n8nctl workflow list                  # List all workflows
n8nctl workflow list --active         # Only active workflows
n8nctl workflow list --tag production # Filter by tag
n8nctl workflow view <id>             # View workflow JSON

# Pull (download to local files)
n8nctl workflow pull <id>             # Pull single workflow
n8nctl workflow pull <id> -r          # Pull with sub-workflows (recursive)
n8nctl workflow pull <id> -r -d ./workflows  # Pull to directory
n8nctl workflow pull <id> -f          # Force overwrite existing files

# Push (upload to n8n)
n8nctl workflow push workflow.json    # Update existing workflow
n8nctl workflow push ./workflows      # Push directory with manifest.json
n8nctl workflow push workflow.json --create  # Create new workflow

# Execute
n8nctl workflow run <id>              # Execute workflow
n8nctl workflow run <id> -w           # Wait for completion
n8nctl workflow run <id> -i '{"key":"value"}'  # With input data

# Activate/deactivate
n8nctl workflow activate <id>
n8nctl workflow deactivate <id>
\`\`\`

### Executions

\`\`\`bash
n8nctl execution list                 # List recent executions
n8nctl execution list --workflow <id> # Filter by workflow
n8nctl execution list --status error  # Filter by status (running, success, error, waiting)
n8nctl execution list --resolve-names # Show workflow names (slower)
n8nctl execution view <id>            # View execution details
n8nctl execution retry <id>           # Retry failed execution
n8nctl execution delete <id>          # Delete execution
\`\`\`

### Tips

- Use \`--json\` flag on any command for JSON output (useful for scripting)
- Aliases: \`workflow\` → \`wf\`, \`execution\` → \`exec\`
- Recursive pull creates \`manifest.json\` tracking workflow dependencies
- Push with manifest handles sub-workflow ID remapping automatically

## Grafana CLI (grafanactl)

Command-line tool for managing Grafana instances. Requires Grafana 12+.

### Configuration

\`\`\`bash
grafanactl config check           # Verify current config
grafanactl config view            # Display full configuration
grafanactl config list-contexts   # List all contexts
grafanactl config current-context # Show active context
grafanactl config use-context staging  # Switch context
\`\`\`

### Setting Up Contexts

\`\`\`bash
# Configure a context (e.g., default, staging, prod)
grafanactl config set contexts.default.grafana.server http://localhost:3000
grafanactl config set contexts.default.grafana.org-id 1
grafanactl config set contexts.default.grafana.token <service-account-token>

# Or use environment variables (useful for CI/CD)
GRAFANA_SERVER='http://localhost:3000' GRAFANA_ORG_ID='1' GRAFANA_TOKEN='...' grafanactl resources list
\`\`\`

### Managing Resources

\`\`\`bash
# List and get resources
grafanactl resources list                    # List available resource types
grafanactl resources get dashboards          # Get all dashboards
grafanactl resources get dashboards/my-dash  # Get specific dashboard

# Pull/push resources (for backup or GitOps)
grafanactl resources pull dashboards -o ./dashboards/   # Download to files
grafanactl resources push ./dashboards/                  # Upload from files
grafanactl resources validate ./dashboards/              # Validate before push

# Edit and delete
grafanactl resources edit dashboards/my-dash  # Edit in default editor
grafanactl resources delete dashboards/my-dash
\`\`\`

### Verbose Output

\`\`\`bash
grafanactl -v resources list      # Verbose
grafanactl -v -v resources list   # More verbose
grafanactl -v -v -v resources list  # Debug level
\`\`\``;

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
  console.log(chalk.gray('This teaches LLMs how to use sqlcmd, sql-env, gh, atl, n8nctl, and grafanactl.\n'));

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
  console.log(chalk.gray('Your AI assistants now know how to use sqlcmd, sql-env, gh, atl, n8nctl, and grafanactl!'));

  return true;
};

/**
 * Export for direct access
 */
export { SUPPORTED_TOOLS, detectExistingConfig, BLOCK_START, BLOCK_END };
