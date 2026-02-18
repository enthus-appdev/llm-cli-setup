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
const CLI_TOOLS_DOCS = `## SQL Server Access (sqlcmd)

### Context Management

Use \`sqlcmd config\` to manage database contexts:

\`\`\`bash
sqlcmd config current-context        # Show current context
sqlcmd config use-context <name>     # Switch context (e.g., sqlcmd config use-context dev)
sqlcmd config get-contexts           # List all configured contexts
\`\`\`

Common context names: local, dev, prod-ro, prod

### Running Queries

After switching contexts, run queries with the \`query\` subcommand:

\`\`\`bash
sqlcmd query "SELECT @@VERSION"
sqlcmd query -d MyDatabase "SELECT TOP 10 * FROM Users"
sqlcmd -i ./scripts/query.sql
\`\`\`

### Safety Rules

**CRITICAL**: Before executing any write operation (INSERT, UPDATE, DELETE, MERGE, TRUNCATE, DROP):
1. Check current context: \`sqlcmd config current-context\`
2. Show the context name and query to the user
3. Ask for explicit confirmation before executing

## GitHub CLI (gh)

Use the \`gh\` command for interacting with github.com

## Atlassian CLI (atl)

Command-line tool for Jira and Confluence. Use \`--json\` for structured output.

### Authentication

\`\`\`bash
atl auth status    # Check authentication
atl auth setup     # First-time OAuth setup (required once)
atl auth login     # Authenticate (opens browser)
\`\`\`

### Context Switching (Multi-Environment)

Switch between Atlassian instances (e.g., production vs sandbox) using aliases:

\`\`\`bash
# Create aliases for hosts
atl config set-alias prod                                    # alias "prod" → current host
atl config set-alias sandbox mycompany-sandbox.atlassian.net # alias "sandbox" → specific host

# Switch active host
atl config use-context prod       # switch by alias
atl config use-context sandbox
atl config use-context mycompany.atlassian.net  # or by full hostname

# Show current host
atl config current-context        # prints alias + hostname

# Remove an alias
atl config delete-alias sandbox

# View all aliases
atl config list                   # shows Aliases section with (current) marker
\`\`\`

Aliases also work with auth commands: \`atl auth status --hostname prod\`

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

# Comments (subcommand pattern, supports Markdown)
atl issue comment list PROJ-1234              # List comments
atl issue comment add PROJ-1234 --body "Comment with **bold** and \`code\`"
atl issue comment edit PROJ-1234 --id <id> --body "Updated text"
atl issue comment delete PROJ-1234 --id <id>

# Attachments
atl issue attachment PROJ-1234 --list       # List attachments
atl issue attachment PROJ-1234 --download <id>  # Download attachment

# Metadata discovery
atl issue types --project PROJ              # List issue types
atl issue priorities                        # List available priorities
atl issue fields --search "story points"    # Search for field by name

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

### Jira Formatting (Extended Markdown via CLI)

The atl CLI accepts extended Markdown for descriptions and comments, converting to Atlassian Document Format (ADF):

\`\`\`markdown
# Heading

Regular **bold** and *italic* text with \`inline code\`.

- Bullet list
- Another item

1. Numbered list
2. Second item

\\\`\\\`\\\`javascript
// Code blocks with language
const x = 1;
\\\`\\\`\\\`

| Column 1 | Column 2 |
|----------|----------|
| Cell 1   | Cell 2   |

> Blockquote text

:::info
Panel content - info, warning, error, note, or success
:::

+++Expandable Section
Hidden content that can be expanded
+++
\`\`\`

**Supported syntax:**
- Standard Markdown: headings, bold, italic, strikethrough, code, lists, links
- Blockquotes: \`> text\`
- Horizontal rules: \`---\` or \`***\` or \`___\`
- GFM tables: \`| Header | Header |\` with \`|---|---|\` separator
- Panels: \`:::info\`, \`:::warning\`, \`:::error\`, \`:::note\`, \`:::success\`
- Expandable sections: \`+++Title\\ncontent\\n+++\`
- Media references: \`!media[attachment-id]\`

**Output format:**
- When viewing issues, descriptions render as Markdown
- Embedded images show as \`[Image: filename]\` placeholders
- Use \`atl issue attachment PROJ-1234 --list\` to see attachments

**Important**: When a Jira issue description contains image references (e.g., \`[Image: filename.png]\`), always download and inspect attachments to understand the full context. Visual information is often essential to understanding requirements.

**Note**: Comments render as plain text only - Markdown formatting does NOT work in comments, only in descriptions.

### Jira Workflow Transitions

Transition names vary by Jira instance and language. Use \`atl issue transition PROJ-123 --list\` to see available transitions for a specific issue.

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

## Grafana

**Config**: \`~/.grafanactl/config.yaml\`

### Logs (logcli)

\`\`\`bash
export LOKI_ADDR="<GRAFANA_URL>/api/datasources/proxy/<DATASOURCE_ID>"
export LOKI_BEARER_TOKEN="<GRAFANA_TOKEN>"

logcli labels k8s_deployment_name
logcli query '{k8s_deployment_name="<deployment>"}' --limit=20 --since=1h
\`\`\`

**Note**: Get server/token from \`~/.grafanactl/config.yaml\`. Datasource ID varies by instance.

### Traces (API)

Must use \`queryType: "traceId"\`:

\`\`\`bash
curl -s "$GRAFANA_URL/api/ds/query" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \\
  -d '{"queries":[{"datasource":{"uid":"grafanacloud-traces"},"query":"<TRACE_ID>","queryType":"traceId"}],"from":"now-1h","to":"now"}'
\`\`\`

### Log→Trace

Logs have \`trace_id\` label. Not all traces stored (sampling).

## Microsoft 365 CLI (m365)

PnP CLI for Microsoft 365 - manage SharePoint, Teams, OneDrive, Planner, and more from the command line.

### Safety Rules

**CRITICAL**: Before executing any write or delete operation (add, set, remove, copy, move):
1. Show the full command and target URL to the user
2. Ask for explicit confirmation before executing
3. DO NOT use the \`--confirm\` flag unless specifically requested by the user

### Authentication

\`\`\`bash
m365 login                        # Login with device code flow (opens browser)
m365 login --authType certificate # Login with certificate
m365 login --authType secret      # Login with client secret
m365 status                       # Check authentication status
m365 logout                       # Logout
\`\`\`

### SharePoint Sites

\`\`\`bash
# List and view sites
m365 spo site list                              # List all sites
m365 spo site list --type TeamSite              # Filter by template type
m365 spo site get --url https://contoso.sharepoint.com/sites/Marketing

# Site administration
m365 spo site add --type TeamSite --title "Project X" --url https://contoso.sharepoint.com/sites/ProjectX
m365 spo site set --url <url> --title "New Title"
m365 spo site remove --url <url>

# Site admins
m365 spo site admin list --siteUrl <url>
m365 spo site admin add --siteUrl <url> --userId user@contoso.com
\`\`\`

### SharePoint Lists

\`\`\`bash
# List management
m365 spo list list --webUrl https://contoso.sharepoint.com/sites/Marketing
m365 spo list get --webUrl <url> --title "Documents"
m365 spo list add --webUrl <url> --title "Tasks" --baseTemplate GenericList
m365 spo list remove --webUrl <url> --title "Old List"

# List items
m365 spo listitem list --webUrl <url> --listTitle "Tasks"
m365 spo listitem list --webUrl <url> --listTitle "Tasks" --filter "Status eq 'Active'"
m365 spo listitem get --webUrl <url> --listTitle "Tasks" --id 1
m365 spo listitem add --webUrl <url> --listTitle "Tasks" --Title "New Task" --Status "Active"
m365 spo listitem set --webUrl <url> --listTitle "Tasks" --id 1 --Status "Complete"
m365 spo listitem remove --webUrl <url> --listTitle "Tasks" --id 1
m365 spo listitem batch add --webUrl <url> --listTitle "Tasks" --filePath ./items.csv
\`\`\`

### SharePoint Files and Folders

\`\`\`bash
# Files
m365 spo file list --webUrl <url> --folder "Shared Documents"
m365 spo file get --webUrl <url> --url "/sites/Marketing/Shared Documents/report.docx"
m365 spo file get --webUrl <url> --url "/sites/Marketing/Shared Documents/report.docx" --asFile --path ./report.docx
m365 spo file add --webUrl <url> --folder "Shared Documents" --path ./local-file.docx
m365 spo file copy --webUrl <url> --sourceUrl "/sites/src/doc.docx" --targetUrl "/sites/dest/doc.docx"
m365 spo file move --webUrl <url> --sourceUrl "/sites/src/doc.docx" --targetUrl "/sites/dest/"
m365 spo file remove --webUrl <url> --url "/sites/Marketing/Shared Documents/old.docx"

# Folders
m365 spo folder list --webUrl <url> --parentFolder "Shared Documents"
m365 spo folder add --webUrl <url> --parentFolder "Shared Documents" --name "Archive"
m365 spo folder copy --webUrl <url> --sourceUrl "/sites/src/folder" --targetUrl "/sites/dest/"
m365 spo folder remove --webUrl <url> --folderUrl "/sites/Marketing/Shared Documents/Archive"

# Sharing
m365 spo file sharinglink list --webUrl <url> --fileUrl "/sites/Marketing/Shared Documents/report.docx"
\`\`\`

### SharePoint Pages

\`\`\`bash
m365 spo page list --webUrl <url>
m365 spo page get --webUrl <url> --name "Home.aspx"
m365 spo page add --webUrl <url> --name "NewPage" --title "New Page"
m365 spo page set --webUrl <url> --name "NewPage.aspx" --title "Updated Title"
m365 spo page remove --webUrl <url> --name "OldPage.aspx"
\`\`\`

### Output Formatting

\`\`\`bash
m365 spo site list --output json              # JSON output (default)
m365 spo site list --output text              # Text table output
m365 spo site list --output csv               # CSV output
m365 spo site list --output json --query "[].{Title:Title,Url:Url}"  # JMESPath filtering
\`\`\`

### Tips

- Use \`--output json\` with \`--query\` for filtering results with JMESPath syntax
- Use \`m365 <command> --help\` for detailed command documentation
- SharePoint URLs are case-sensitive in many operations
- NEVER use \`--confirm\` flag autonomously - it skips safety prompts

## Elasticsearch Query CLI (esq)

Query Elasticsearch clusters across environments. Supports environment switching (like sqlcmd contexts).

### Environment Management

\`\`\`bash
esq config add <name> --url <url>    # Add environment
esq config use <name>                # Switch active environment
esq config list                      # List environments (* = active)
esq config remove <name>             # Remove environment
\`\`\`

### Querying

\`\`\`bash
# Search with Lucene query syntax
esq search <index> <query>                        # Basic search
esq search documents "DocumentNo:12345"            # Partial index name auto-resolves
esq search documents "CustomerName:Müller" --size 50  # Limit results
esq search documents "Status:active" --source Name,Status  # Filter returned fields

# Get document by _id
esq get <index> <doc-id>

# Count documents
esq count <index>                     # Count all
esq count <index> <query>             # Count matching

# Full Query DSL (JSON body)
esq query <index> '{"query":{"term":{"DocumentNo":12345}}}'
esq query <index> '{"query":{"match_all":{}},"size":1,"_source":["Field1","Field2"]}'
\`\`\`

### Cluster Info

\`\`\`bash
esq health                           # Cluster health + node stats
esq indices                          # List all indices
esq indices <filter>                 # Filter indices by name (e.g. "sales")
esq mapping <index>                  # Show index field mapping
\`\`\`

### Tips

- Use \`--env <name>\` on any command to override the active environment
- Index names support partial matching: \`documents\` resolves to latest version
- Info messages go to stderr, data to stdout - safe for piping: \`esq search ... | jq '.hits.hits[]'\`
- Shell completion: \`esq completion zsh\` (or bash/fish/powershell)`;

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
  console.log(
    chalk.gray(
      'This teaches LLMs how to use sqlcmd, gh, atl, n8nctl, grafanactl, logcli, m365, and esq.\n'
    )
  );

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
          {
            name: 'Update CLI tools documentation (preserves your other content)',
            value: 'update',
          },
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
  console.log(
    chalk.gray(
      'Your AI assistants now know how to use sqlcmd, gh, atl, n8nctl, grafanactl, logcli, m365, and esq!'
    )
  );

  return true;
};

/**
 * Export for direct access
 */
export { SUPPORTED_TOOLS, detectExistingConfig, BLOCK_START, BLOCK_END };
