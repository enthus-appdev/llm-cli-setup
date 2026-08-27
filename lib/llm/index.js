import chalk from 'chalk';
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
    // ~/.gemini/GEMINI.md is read by Antigravity (Google's agentic IDE); the
    // standalone Gemini CLI that previously consumed it is sunset.
    name: 'Antigravity CLI',
    dir: '.gemini',
    file: 'GEMINI.md',
  },
  {
    name: 'OpenAI Codex CLI',
    dir: '.codex',
    file: 'AGENTS.md',
  },
];

// Individual CLI tool documentation files
const CLI_DOCS = {
  sqlcmd: {
    filename: 'cli-sqlcmd.md',
    name: 'sqlcmd',
    purpose: 'SQL Server queries and context switching',
    content: `## SQL Server Access (sqlcmd)

### Context Management

Use \`sqlcmd config\` to manage database contexts:

\`\`\`bash
sqlcmd config current-context        # Show current context
sqlcmd config use-context <name>     # Switch context (e.g., sqlcmd config use-context dev)
sqlcmd config get-contexts           # List all configured contexts
\`\`\`

Common context names: local, dev, prod-ro, prod

### Running Queries

**Always set the context explicitly before every query.** Multiple Claude sessions and users share the same sqlcmd config — another session can switch the context at any time. Never assume the current context is what you expect.

\`\`\`bash
sqlcmd config use-context local && sqlcmd query "SELECT @@VERSION"
sqlcmd config use-context stage && sqlcmd query -d MyDatabase "SELECT TOP 10 * FROM Users"
sqlcmd -i ./scripts/query.sql
\`\`\`

### Safety Rules

**CRITICAL**: Before executing any write operation (INSERT, UPDATE, DELETE, MERGE, TRUNCATE, DROP):
1. Check current context: \`sqlcmd config current-context\`
2. Show the context name and query to the user
3. Ask for explicit confirmation before executing

### Gotchas

- When passing multi-line SQL starting with \`--\` comments as a positional argument, the CLI parses \`--\` as flag prefixes. Use the \`--query\` flag instead:
  \`\`\`bash
  sqlcmd query --query "-- this comment won't break
  SELECT 1"
  \`\`\`
`,
  },
  gh: {
    filename: 'cli-gh.md',
    name: 'gh',
    purpose: 'GitHub CLI for repos, PRs, issues, and actions',
    content: `## GitHub CLI (gh)

Use the \`gh\` command for interacting with github.com

### PR Line Comments via Reviews Endpoint

Use the **reviews endpoint** (\`POST /pulls/{id}/reviews\`) with a \`comments\` array — NOT the individual comments endpoint. Pass the body as raw JSON via \`--input -\`; \`--field\` serializes arrays as strings.

\`\`\`bash
cat <<'JSONEOF' | gh api repos/{owner}/{repo}/pulls/{pr}/reviews -X POST --input -
{
  "commit_id": "<sha>",
  "event": "COMMENT",
  "body": "Review summary here",
  "comments": [
    { "path": "path/to/file.go", "line": 42, "body": "Comment text with **markdown**" }
  ]
}
JSONEOF
\`\`\`

Rules:
- Line numbers are **new-file line numbers** (not diff line numbers)
- GitHub returns 422 if a comment targets a line outside the diff hunk
- The \`+N\` in \`@@ -old,count +N,count @@\` is the starting new-file line number

### Mapping Diff Lines to New-File Line Numbers

\`gh pr diff\` piped to python3 may produce empty output — save to a temp file first. Use \`mktemp\` rather than a fixed path so concurrent runs (multiple sessions, multiple reviewers) don't clobber each other:

\`\`\`bash
DIFF_FILE=$(mktemp -t pr-diff)
trap 'rm -f "$DIFF_FILE"' EXIT
gh pr diff {pr} --repo {owner}/{repo} > "$DIFF_FILE" 2>&1
python3 -c "
import os
current_file = ''
line_no = 0
with open(os.environ['DIFF_FILE']) as f:
    for line in f:
        if line.startswith('diff --git'):
            current_file = line.split(' b/')[-1].strip()
        elif line.startswith('@@'):
            parts = line.split('+')[1].split(' ')[0].split(',')
            line_no = int(parts[0])
        elif not line.startswith('-'):
            if 'search_term' in line:
                print(f'{current_file}:{line_no} -> {line.rstrip()}')
            line_no += 1
"
\`\`\`

Counting rules:
- Lines starting with \`-\` don't count toward new-file line numbers
- Lines starting with \` \` (context) and \`+\` (added) both increment the counter

### Listing and Deleting Comments

\`\`\`bash
gh api repos/{owner}/{repo}/pulls/{pr}/comments --jq '.[] | {id, line, path, body: (.body | .[0:80])}'
gh api repos/{owner}/{repo}/pulls/comments/{comment_id} -X DELETE
\`\`\`

### Local Repo May Be Behind

When reviewing a PR against the current default branch, the local checkout may not include recently merged PRs. Always pull from origin first:

\`\`\`bash
git fetch origin main
git show origin/main:path/to/file
\`\`\`
`,
  },
  atl: {
    filename: 'cli-atl.md',
    name: 'atl',
    purpose: 'Atlassian CLI for Jira issues, Confluence pages, and workflows',
    content: `## Atlassian CLI (atl)

Command-line tool for Jira and Confluence. Use \`--json\` for structured output.
The context and Assets commands below require atl-cli v1.13.0 or newer.

### Authentication

\`\`\`bash
atl auth status    # Check every configured site
atl auth setup     # First-time OAuth setup (required once)
atl auth login --hostname mycompany.atlassian.net
\`\`\`

### Context Switching (Multi-Environment)

Switch between Atlassian instances (e.g., production vs sandbox) using aliases:

\`\`\`bash
# Create aliases for hosts
atl config set-alias prod                                    # alias "prod" → current host
atl config set-alias sandbox mycompany-sandbox.atlassian.net # alias "sandbox" → specific host

# Switch the persistent default for an interactive shell only
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

Aliases can be used with the \`--hostname\` flag to target an environment for a single command: \`atl auth status --hostname prod\`

Auth commands use \`--hostname\`; Jira, Confluence, and Assets operations use
the root \`--context\` option.

**Always pass \`--context <alias-or-hostname>\` on every Jira, Confluence, or
Assets operation.** The persistent default is shared across processes, so an
agent must never rely on it or run \`atl config use-context\`. A required guard
in managed agent sessions blocks context-less API commands.

\`\`\`bash
atl --context prod jira issue view PROJ-1234
atl --context sandbox confluence space list
\`\`\`

Inline \`ATLASSIAN_CONTEXT=prod atl ...\` is equivalent, but the flag is preferred.

Jira commands are under \`atl jira\` (\`atl jira issue\`, \`atl jira board\`, \`atl jira sm\`, \`atl jira sprint\`). The bare \`atl issue\`/\`atl board\`/\`atl sm\` forms still work as deprecated aliases (they warn) and may be removed.

### Jira Assets

Assets uses the explicitly selected host's OAuth token and auto-discovers its
workspace. Re-authenticate each hostname after CMDB scopes are added to the app.

\`\`\`bash
atl --context sandbox jira assets count
atl --context sandbox jira assets aql 'objectType = Customer' --limit 25
atl --context sandbox jira assets object 9244 --json
\`\`\`

### Jira Issues

The examples below use \`prod\` as a placeholder. Resolve and substitute the
intended alias or hostname before running any command, especially a write.

\`\`\`bash
# View and list
atl --context prod jira issue view PROJ-1234              # View issue details (includes custom fields)
atl --context prod jira issue view PROJ-1234 --json       # View as JSON (custom_fields section)
atl --context prod jira issue list --assignee @me         # Your assigned issues
atl --context prod jira issue list --jql "status = Open"  # Custom JQL query

# Create
atl --context prod jira issue create --project PROJ --type Bug --summary "Title"
atl --context prod jira issue create --project PROJ --type Task --summary "Title" --description "Details"
atl --context prod jira issue create --project PROJ --parent PROJ-123 --summary "Subtask"  # Auto-discovers subtask type
atl --context prod jira issue create --project PROJ --type Bug --summary "Title" --security "Developer only"  # Restrict visibility

# Edit
atl --context prod jira issue edit PROJ-1234 --summary "New summary"
atl --context prod jira issue edit PROJ-1234 --assignee @me
atl --context prod jira issue edit PROJ-1234 --description "New description"
atl --context prod jira issue edit PROJ-1234 --description "Appended text" --append
atl --context prod jira issue edit PROJ-1234 --add-label bug --remove-label wontfix
atl --context prod jira issue edit PROJ-1234 --priority High
atl --context prod jira issue edit PROJ-1234 --field "Story Points=8"        # Custom field by name
atl --context prod jira issue edit PROJ-1234 --field "customfield_10016=8"    # Custom field by ID
atl --context prod jira issue edit PROJ-1234 --field "Custom Field=Some **markdown** text"  # Auto-converts to ADF
atl --context prod jira issue edit PROJ-1234 --field-file fields.json         # Complex values from JSON file
atl --context prod jira issue edit PROJ-1234 --security "Developer only"      # Set issue security level (by name or id)
atl --context prod jira issue edit PROJ-1234 --security ""                    # Clear issue security level

# Workflow
atl --context prod jira issue transition PROJ-1234 "In Progress"
atl --context prod jira issue transition PROJ-1234 --list                     # List available transitions
atl --context prod jira issue transition PROJ-1234 "Done" --field "Resolution=Fixed"  # Transition with required fields

# Issue links
atl --context prod jira issue link PROJ-1 PROJ-2 --type Blocks
atl --context prod jira issue link PROJ-1 --list                              # List links on an issue
atl --context prod jira issue link PROJ-1 --delete <id>                       # Delete a link by ID
atl --context prod jira issue link --list-types                               # List available link types

# Web links
atl --context prod jira issue weblink PROJ-1234 --url "https://..." --title "Title"

# Sprint management
atl --context prod jira issue sprint PROJ-1234 --sprint-id 123
atl --context prod jira issue sprint PROJ-1234 --backlog
atl --context prod jira issue sprint --list-sprints --board 42

# Sprint lifecycle (atl jira sprint)
atl --context prod jira sprint create --board 42 --name "Sprint 30" --goal "..."   # future sprint
atl --context prod jira sprint create --board 42 --name "Sprint 30" --start --duration 14d  # create + start
atl --context prod jira sprint edit 123 --goal "Updated goal"
atl --context prod jira sprint start 123 --duration 14d
atl --context prod jira sprint close 123                 # prompts unless --force
atl --context prod jira sprint list --board 42 [--state active,future,closed]
atl --context prod jira sprint move NX-1 NX-2 --to 123   # or --sprint "name" --board 42
atl --context prod jira sprint backlog NX-1

# Comments (subcommand pattern, supports Markdown)
atl --context prod jira issue comment list PROJ-1234              # List comments
atl --context prod jira issue comment add PROJ-1234 --body "Comment with **bold** and \`code\`"
atl --context prod jira issue comment edit PROJ-1234 --id <id> --body "Updated text"
atl --context prod jira issue comment delete PROJ-1234 --id <id>

# Attachments
atl --context prod jira issue attachment PROJ-1234 --list       # List attachments
atl --context prod jira issue attachment PROJ-1234 --download <id>  # Download attachment

# Metadata discovery
atl --context prod jira issue types --project PROJ                            # List issue types
atl --context prod jira issue priorities                                      # List available priorities
atl --context prod jira issue fields --search "story points"                  # Search for field by name
atl --context prod jira issue fields --custom --json                          # List all custom fields
atl --context prod jira issue field-options --project PROJ --type Bug         # Allowed values for select/radio fields
atl --context prod jira issue field-options --project PROJ --type Bug --field "Repo"  # Specific field options
atl --context prod jira issue field-options --project PROJ --type Bug --field security # Security levels (for --security)

# Read-only REST passthrough (atl v1.12.0+; GET only, path relative to /rest/api/3)
atl --context prod jira api GET issue/PROJ-1234/editmeta                      # Endpoints atl doesn't model
atl --context prod jira api project/PROJ/securitylevel                        # Method arg optional; defaults to GET

# Board sorting / ranking
atl --context prod jira issue list --jql 'project = PROJ AND statusCategory = Done ORDER BY statuscategorychangedate DESC' --limit 50 --json
atl --context prod jira board rank PROJ-124 PROJ-125 --after PROJ-123 --board-id <board-id>  # Rank relative to another issue
\`\`\`

**Board ranking tips**:
- Use \`--after\` or \`--before\` to establish relative order within columns (not \`--top\` which only affects backlog)
- 50 issue limit per rank call (batch if needed)
- Use \`statuscategorychangedate\` for "when moved to Done" (not \`updated\` or \`resolutiondate\`)
- Use \`statusCategory = Done\` for locale-agnostic queries (status names like "Erledigt" vary by language)

### Confluence

\`\`\`bash
# Spaces
atl --context prod confluence space list                   # List all spaces
atl --context prod confluence space list --all             # Fetch all (follows pagination)

# View pages
atl --context prod confluence page view <id>               # View by ID
atl --context prod confluence page view -s DOCS -t "Title" # View by space + exact title
atl --context prod confluence page view <id> --raw         # Get storage format (XHTML)
atl --context prod confluence page view <id> --web         # Open in browser

# List pages
atl --context prod confluence page list -s DOCS            # List pages in space
atl --context prod confluence page list -s DOCS --status draft     # List drafts
atl --context prod confluence page list -s DOCS --status archived  # List archived
atl --context prod confluence page list -s DOCS --all      # Fetch all pages

# Search (uses v1 API - different scopes than v2)
atl --context prod confluence page search -q "term"        # Search by title
atl --context prod confluence page search -q "term" -s DOCS  # Search within space
atl --context prod confluence page search --cql "ancestor = <id>"   # Search in hierarchy
atl --context prod confluence page search --cql "parent = <id>"     # Direct children only
atl --context prod confluence page search --cql "type = page AND text ~ 'keyword'"

# Create and edit
atl --context prod confluence page create -s DOCS -t "Title" -b "<p>Content</p>"
atl --context prod confluence page create -s DOCS -t "Title" --parent <id>  # Child page
atl --context prod confluence page create -s DOCS -t "Title" --draft        # Create as draft
atl --context prod confluence page edit <id> --title "New Title"
atl --context prod confluence page edit <id> --body "<p>New content</p>"

# Hierarchy navigation
atl --context prod confluence page children <id>              # List immediate children
atl --context prod confluence page children <id> --descendants  # All descendants with depth
atl --context prod confluence page children <id> --type folder  # Only folders
atl --context prod confluence page children <id> --type page    # Only pages

# Move pages
atl --context prod confluence page move <id> --target <parent-id>  # Move as child of target
atl --context prod confluence page move <id> --target <id> --position before  # Reorder siblings
atl --context prod confluence page move <id> --target <id> --position after
atl --context prod confluence page move <id> --space NEWSPACE  # Move to different space

# Archive and delete
atl --context prod confluence page archive <id>            # Archive page
atl --context prod confluence page delete <id> --force     # Delete (skip confirmation)
atl --context prod confluence page publish <id>            # Publish draft

# Templates (v1 API - requires Space Admin or Confluence Admin)
atl --context prod confluence template view <id>           # View template
atl --context prod confluence template view <id> --raw     # View raw storage format
atl --context prod confluence template create -s DOCS --name "Meeting Notes" --body "<h1>Notes</h1>"
atl --context prod confluence template create --name "Global Template" --body "<p>Content</p>"  # Global (admin only)
atl --context prod confluence template update <id> --name "New Name" --body "<p>Updated</p>"
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
atl --context prod confluence page create -s DOCS --parent <parent-id> -t "New Name" -b "<p>Folder</p>"
# Move each child to new parent
atl --context prod confluence page move <child-id> --target <new-folder-id>
# Delete old folder
atl --context prod confluence page delete <old-folder-id> --force
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
- Mentions: \`@[Display Name]\` or \`@[id:accountId]\`

**Output format:**
- When viewing issues, descriptions render as Markdown
- Embedded images show as \`[Image: filename]\` placeholders
- Use \`atl --context prod jira issue attachment PROJ-1234 --list\` to see attachments

**Important**: When a Jira issue description contains image references (e.g., \`[Image: filename.png]\`), always download and inspect attachments to understand the full context. Visual information is often essential to understanding requirements.

**Note**: Both descriptions and comments support full Markdown formatting (converted to ADF). Use \`--body-file <path>\` for multi-line or complex content to avoid shell escaping issues.

**Textarea custom fields** (\`--field\`): Automatically converts Markdown to ADF. Use literal \`\\n\` for newlines:
\`\`\`bash
atl --context prod jira issue edit PROJ-1234 --field 'Kontext=Line 1\\n\\nLine 2\\n- Bullet A\\n- Bullet B'
atl --context prod jira issue edit PROJ-1234 --field 'Kontext=+++Expand Title\\nHidden content\\n+++'
\`\`\`

**Code names with underscores**: Use backticks in descriptions (\`MY_TABLE_NAME\`). Bare underscores render as italic (\`MY_TABLE_NAME\` → MY*TABLE*NAME). Backslash-escaping (\`MY\\_TABLE\\_NAME\`) renders backslashes literally.

### Typed Custom Fields — \`--field\` vs \`--field-file\`

Plain \`--field "Name=value"\` is string-only. Complex Jira field types need \`--field-file <file.json>\` with the right shape:

| Field type | Shape | Plain \`--field\` works? |
|---|---|---|
| Text / number | \`"Name": "value"\` | Yes |
| Label array | \`"Name": ["A", "B"]\` | No — returns 400 |
| Select / radio | \`"Name": {"value": "Option"}\` | No — \`Specify a valid 'id' or 'name'...\` |
| User picker | \`"Name": {"accountId": "..."}\` | No |
| Multi-select | \`"Name": [{"value": "A"}, {"value": "B"}]\` | No |
| Issue security level | use \`--security "<name|id>"\` instead | No — \`--field\` can't set it |

**Issue security level** has a dedicated flag (atl v1.12.0+) — don't reach for \`--field-file\`. Set it on create/edit with \`--security "Developer only"\` (name or numeric id); \`--security ""\` on edit clears it. Discover a project's levels with \`atl --context prod jira issue field-options --project PROJ --type Bug --field security\`.

Example combining labels + select + radio (placeholder field names — the actual fields and allowed values depend on your project's schema, not on this example):

\`\`\`json
{
  "ComponentLabels": ["Backend", "Frontend"],
  "Severity": {"value": "Medium"},
  "Regression": {"value": "Yes"}
}
\`\`\`

Apply with \`atl --context prod jira issue edit PROJ-123 --field-file fields.json\` or include in \`atl --context prod jira issue transition\`. Discover allowed values for any select/radio field before guessing:

\`\`\`bash
atl --context prod jira issue field-options --project PROJ --type Bug --field "Severity"
\`\`\`

### Markdown→ADF Converter Hang Traps

The atl markdown→ADF converter **hangs indefinitely** (no error, no output) on certain nested structures:

- **Indented code fences inside ordered/bulleted lists** — e.g. a 4-space-indented \` \`\`\` \` block beneath \`1. Step description:\`. Never returns.
- **HTML-like angle bracket placeholders** — \`<new-token>\`, \`<placeholder>\`. Interpreted as unclosed HTML tags during ADF conversion.

Workaround: flatten nested code into inline single-backtick fragments; replace \`<placeholder>\` with plain words (\`TOKEN\`, \`BRANCH_NAME\`). Validate large descriptions by creating with \`--summary "TEST DELETE ME"\` first.

### Mentions

- \`@[Display Name]\` or \`@[id:accountId]\` — generates a real Jira mention with notification
- Plain \`@Name\` — renders as text, no notification
- \`[~accountid:...]\` / \`[~username]\` — raw ADF syntax. The Markdown→ADF pipeline ships it as literal text. Do NOT use.

### Service Desk Comment De-duplication

\`atl --context prod jira issue comment add\` against an SD ticket can return success with a comment ID that never actually surfaces in the UI. Always verify with \`atl --context prod jira issue comment list <issue>\` before assuming a post landed.

### Underlying Jira API Notes

- v2 API (\`/rest/api/2/search\`) has been removed — must use v3
- v3 API (\`/rest/api/3/search/jql\`) uses \`nextPageToken\` pagination (not \`startAt\`/\`maxResults\` offset)
- v3 returns rich text fields as ADF (Atlassian Document Format) objects, not strings
- ADF fields: description, environment, custom fields (type=doc), comment bodies
- Need \`fields=*all\` param to get full field data (v3 defaults to minimal)

### Jira Workflow Transitions

Transition names vary by Jira instance and language. Use \`atl --context prod jira issue transition PROJ-123 --list\` to see available transitions for a specific issue.

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
`,
  },
  n8nctl: {
    filename: 'cli-n8nctl.md',
    name: 'n8nctl',
    purpose: 'n8n workflow management, execution, and variables',
    content: `## n8n Workflow CLI (n8nctl)

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

# Execute via webhook (use when /execute returns 405)
n8nctl workflow run <id> --webhook <path>              # Trigger via GET
n8nctl workflow run <id> --webhook <path> --method POST # Trigger via POST

# Activate/deactivate
n8nctl workflow activate <id>
n8nctl workflow deactivate <id>
\`\`\`

### Variables

\`\`\`bash
n8nctl variable list                  # List all variables
n8nctl variable get <key>             # Get variable value by key
n8nctl variable create <key> <value>  # Create a variable
n8nctl variable create <key> --value 'b!xyz'  # Use --value flag for shell-special chars
n8nctl variable update <key> <value>  # Update a variable
n8nctl variable update <key> --value 'new'    # Use --value flag for shell-special chars
n8nctl variable delete <key>          # Delete a variable
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
- Aliases: \`workflow\` → \`wf\`, \`execution\` → \`exec\`, \`variable\` → \`var\`
- Recursive pull creates \`manifest.json\` tracking workflow dependencies
- Push with manifest handles sub-workflow ID remapping automatically
`,
  },
  grafana: {
    filename: 'cli-grafana.md',
    name: 'grafana',
    purpose: 'Grafana Cloud queries (logs, metrics, traces, resources) via gcx',
    content: `## Grafana Cloud (gcx)

**Config**: \`~/.config/gcx/config.yaml\` (contexts + stack).

\`gcx\` is the unified Grafana Cloud CLI. It replaces the old \`logcli\` and \`grafanactl\` CLIs.

### Setup / verify

\`\`\`bash
gcx config check                 # Verify active context & connectivity
gcx login <ctx> --server <url>   # Log in and create/use a context
\`\`\`

### Logs (Loki)

\`\`\`bash
gcx logs query '{service_name="<service>"}' --since=1h
gcx logs query '{deployment_environment="production"}' --since=24h --limit=200
\`\`\`

### Metrics (Prometheus)

\`\`\`bash
gcx metrics query 'rate(http_requests_total[5m])'
\`\`\`

### Traces (Tempo)

\`\`\`bash
gcx traces get <TRACE_ID>          # Retrieve a trace by ID
\`\`\`

### Resources (dashboards, datasources, ...)

\`\`\`bash
gcx resources list-types         # List resource types
gcx dashboards list              # List dashboards
gcx datasources list             # List datasources
\`\`\`

**Notes**: Logs are queried by resource-attribute labels (\`service_name\`, \`deployment_environment\`, ...), not \`k8s_*\` labels. Log→trace correlation uses the \`trace_id\` label; not all traces are stored (sampling).
`,
  },
  m365: {
    filename: 'cli-m365.md',
    name: 'm365',
    purpose: 'Microsoft 365 CLI for SharePoint, Teams, and OneDrive',
    content: `## Microsoft 365 CLI (m365)

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
`,
  },
  esq: {
    filename: 'cli-esq.md',
    name: 'esq',
    purpose: 'Elasticsearch queries, cluster info, and environment switching',
    content: `## Elasticsearch Query CLI (esq)

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
- Shell completion: \`esq completion zsh\` (or bash/fish/powershell)
`,
  },
  discordctl: {
    filename: 'cli-discordctl.md',
    name: 'discordctl',
    purpose: 'Discord messages, reactions, channel management, and scheduled events',
    content: `## Discord CLI (discordctl)

Command-line tool for Discord REST API interactions. REST-only, no persistent bot/gateway.

### Configuration

\`\`\`bash
discordctl config init                          # Interactive: token, guild ID, display name, emoji
discordctl config channels                      # List configured aliases
discordctl config emojis                        # List available server emojis
discordctl config add-channel <alias> <id>      # Add/update alias
discordctl config remove-channel <alias>        # Remove alias
\`\`\`

### Messages

\`\`\`bash
discordctl msg list <channel> [--limit N]       # Read messages (default 20, max 100)
discordctl msg list <channel> --active          # Only messages without checkmark (current allocations)
discordctl msg list <channel> --thread <id>     # Read messages in a thread
discordctl msg send <channel> "text"            # Post a message (prefixed with personalEmoji or displayName)
discordctl msg send <channel> "text" --silent   # Post without triggering notifications
discordctl msg send <channel> "text" --thread <id>  # Send to a thread
discordctl msg edit <channel> <message-id> "text"   # Edit a bot message
discordctl msg delete <channel> <message-id>    # Delete a message (bot messages only)
discordctl msg pins <channel>                   # List pinned messages
discordctl msg pin <channel> <message-id>       # Pin a message
discordctl msg unpin <channel> <message-id>     # Unpin a message
\`\`\`

### Reactions

\`\`\`bash
discordctl react add <channel> <message-id> <emoji>    # Add reaction (name or unicode)
discordctl react remove <channel> <message-id> <emoji> # Remove your reaction
\`\`\`

Common emoji names: thumbsup, white_check_mark, rocket, eyes, tada, heart, fire, warning, bug, memo

### Channels

\`\`\`bash
discordctl channels list [--type text|voice]    # List server channels
\`\`\`

### Scheduled Events

\`\`\`bash
discordctl event list                           # List all scheduled events
discordctl event create --name "Name" --start "2026-04-01T10:00" --end "2026-04-01T11:00" --location "Online"  # External event
discordctl event create --name "Name" --start "2026-04-01T10:00" --end "2026-04-01T11:00" --channel "General Voice"  # Voice/stage event
discordctl event delete <event-id>              # Delete an event
\`\`\`

Times accept RFC3339 (\`2006-01-02T15:04:05Z07:00\`) or short format (\`2006-01-02T15:04\`, interpreted as local time). Use \`--location\` for external events or \`--channel\` for voice/stage channel events (mutually exclusive).

### Identity

Messages sent via \`msg send\` are automatically prefixed to identify the sender:
- **personalEmoji** — custom emoji rendered inline as prefix (e.g. \`:biohazard: — Stage GUI\`)
- **displayName** — bold text fallback if no emoji is configured

Set both via \`discordctl config init\`.

### Channel Resolution

Channels resolve in order: configured alias → raw numeric ID → guild channel name lookup (case-insensitive, with suggestions on failure).

### Tips

- Use \`--json\` flag on any command for structured JSON output
- Use \`--silent\` on \`msg send\` to suppress notifications (useful for testing)
- Configure aliases for frequently used channels to avoid API lookups
`,
  },
  playwright: {
    filename: 'cli-playwright.md',
    name: 'playwright',
    purpose: 'Browser automation for screenshots, PDFs, and web testing',
    content: `## Playwright (Browser Automation)

Headless browser automation for screenshots, PDF generation, network analysis, and web testing.

### CLI Commands

\`\`\`bash
# Screenshots
npx playwright screenshot <url> <filename>              # Capture screenshot
npx playwright screenshot --full-page <url> <filename>  # Full page screenshot
npx playwright screenshot -b firefox <url> <filename>   # Use Firefox instead of Chromium

# PDF generation
npx playwright pdf <url> <filename>                     # Save page as PDF

# Common options (work with screenshot and pdf)
--wait-for-timeout <ms>              # Wait before capture
--wait-for-selector <selector>       # Wait for element
--viewport-size "1280, 720"          # Set viewport
--device "iPhone 11"                 # Emulate device
--color-scheme dark                  # Dark mode
--timeout <ms>                       # Navigation timeout
--ignore-https-errors                # Skip SSL errors

# Network capture
npx playwright screenshot --save-har <file.har> <url> <filename>  # Save HAR with screenshot
npx playwright screenshot --save-storage <file.json> <url> <filename>  # Save cookies/storage
npx playwright screenshot --load-storage <file.json> <url> <filename>  # Load saved session
\`\`\`

### Programmatic API

For advanced scenarios (HTTP Basic Auth, cookie injection, console/network monitoring), use the Node.js API:

\`\`\`bash
NODE_PATH=$(npm root -g) node script.js   # Required to resolve global playwright package
\`\`\`

\`\`\`javascript
const { chromium } = require('playwright');

const browser = await chromium.launch();
const context = await browser.newContext({
  httpCredentials: { username: 'user', password: 'pass' },  // HTTP Basic Auth
  ignoreHTTPSErrors: true,
});

// Inject cookies before navigation
await context.addCookies([{ name: 'session', value: 'token', domain: 'example.com', path: '/' }]);

const page = await context.newPage();

// Monitor console and network
page.on('console', msg => console.log(\`[\${msg.type()}] \${msg.text()}\`));
page.on('requestfailed', req => console.log(\`FAILED: \${req.url()}\`));
page.on('response', resp => console.log(\`\${resp.status()} \${resp.url()}\`));

await page.goto('https://example.com', { waitUntil: 'networkidle', timeout: 30000 });
await page.screenshot({ path: 'screenshot.png', fullPage: true });
await browser.close();
\`\`\`

### Tips

- CLI \`screenshot\` command does NOT support HTTP Basic Auth via URL (Chromium deprecated this) — use the programmatic API with \`httpCredentials\` instead
- Use \`--save-har\` to capture all network requests for debugging
- Use \`--load-storage\` / \`--save-storage\` to persist and reuse authentication sessions
- HAR files can be parsed as JSON: \`python3 -c "import json; ..."\` or \`jq\`
- Browser installation: \`npx playwright install chromium\` (run after updates)
`,
  },
  hcloud: {
    filename: 'cli-hcloud.md',
    name: 'hcloud',
    purpose: 'Hetzner Cloud resources (servers, networks, volumes, firewalls)',
    content: `## Hetzner Cloud CLI (hcloud)

Official CLI for managing Hetzner Cloud resources. Stores per-project API tokens in named contexts at \`~/.config/hcloud/cli.toml\`.

### Context Management

\`\`\`bash
hcloud context create <name>       # Interactive: prompts for API token
hcloud context list                # List contexts (* = active)
hcloud context active              # Print active context name
hcloud context use <name>          # Switch active context
hcloud context delete <name>       # Remove context
\`\`\`

Generate API tokens at <https://console.hetzner.cloud/> → Project → Security → API Tokens.

### Servers

\`\`\`bash
hcloud server list                                    # List all servers
hcloud server list -o columns=id,name,status,ipv4     # Custom columns
hcloud server describe <id-or-name>                   # Full details
hcloud server create --name web1 --type cx22 --image debian-12 --ssh-key my-key
hcloud server delete <id-or-name>
hcloud server reboot <id-or-name>
hcloud server poweron <id-or-name>
hcloud server poweroff <id-or-name>
hcloud server reset <id-or-name>                      # Hardware reset
hcloud server enable-rescue <id-or-name>              # Boot into rescue
hcloud server disable-rescue <id-or-name>
hcloud server ssh <id-or-name>                        # SSH using stored key
\`\`\`

### Volumes, Networks, Firewalls, Load Balancers

\`\`\`bash
hcloud volume list / create / attach / detach / delete
hcloud network list / create / add-subnet / add-route / delete
hcloud firewall list / create / apply-to-resource / delete
hcloud load-balancer list / create / add-target / delete
hcloud ssh-key list / create / delete
hcloud floating-ip list / create / assign / unassign
hcloud image list                                     # Available OS images
hcloud server-type list                               # Available server types
hcloud location list / datacenter list                # Available locations
\`\`\`

### Output Formatting

\`\`\`bash
hcloud server list -o json                            # JSON output (pipe to jq)
hcloud server list -o noheader                        # No table header
hcloud server list -o columns=name,status,ipv4       # Pick columns
\`\`\`

### Safety Rules

**CRITICAL**: Before executing any destructive operation (\`delete\`, \`reset\`, \`poweroff\`):
1. Check active context: \`hcloud context active\`
2. Show the resource and target context to the user
3. Ask for explicit confirmation before executing
4. Most delete commands need \`--yes\` to skip the prompt — never pass it autonomously

### Tips

- Set \`HCLOUD_TOKEN\` env var to override the active context for a single command
- Servers, volumes, networks all accept names OR numeric IDs
- Shell completion: \`hcloud completion zsh\` (or bash/fish)
- Use \`--help\` on any subcommand for the full flag list
`,
  },
  ovhcloud: {
    filename: 'cli-ovhcloud.md',
    name: 'ovhcloud',
    purpose: 'OVHcloud resources (VPS, dedicated servers, domains, cloud projects)',
    content: `## OVHcloud CLI (ovhcloud)

Official CLI for managing OVHcloud services. Stores API credentials in \`~/.ovh.conf\` (INI format; \`OVH_CONFIG\` overrides the path).

### Authentication

\`\`\`bash
ovhcloud login                     # Interactive: creates OAuth2 credentials
\`\`\`

The \`[default]\` section selects the endpoint (default \`ovh-eu\`); each endpoint has its own credentials section (e.g. \`[ovh-eu]\` with \`client_id\`/\`client_secret\`). Override any value per-command with the \`OVH_*\` env vars.

### Common Commands

\`\`\`bash
ovhcloud me                                           # Account info (whoami)
ovhcloud vps list / <id>                              # VPS instances
ovhcloud dedicated-server list / <id>                 # Dedicated servers
ovhcloud domain list / <name>                         # Domains
ovhcloud cloud project list                           # Public Cloud projects
ovhcloud cloud project <id> instance list             # Instances in a project
\`\`\`

Every command supports \`--help\` for its subcommands and flags. Use \`--format json\` (where available) for machine-readable output.

### Safety Rules

**CRITICAL**: Before executing any destructive operation (\`delete\`, \`terminate\`, \`reinstall\`, \`reboot\`):
1. Show the resource and target account/endpoint to the user
2. Ask for explicit confirmation before executing
3. Never pass a \`--yes\`/confirmation-skipping flag autonomously

### Tips

- The binary installs to \`~/.local/bin\` via the official install script — ensure it is on your PATH
- Multiple accounts: use separate endpoint sections / profiles in \`~/.ovh.conf\`
`,
  },
};

/**
 * Write individual CLI doc files to the docs/ directory of an LLM tool.
 */
const writeDocFiles = (configDir) => {
  const docsDir = path.join(configDir, 'docs');
  ensureDir(docsDir);
  for (const doc of Object.values(CLI_DOCS)) {
    fs.writeFileSync(path.join(docsDir, doc.filename), doc.content);
  }
  return docsDir;
};

/**
 * Generate a slim routing table pointing to individual doc files
 */
const generateCliToolsBlock = (llmDir) => {
  const docsPath = `~/${llmDir}/docs`;
  const rows = Object.values(CLI_DOCS)
    .map((doc) => `| ${doc.name} | ${doc.purpose} | ${docsPath}/${doc.filename} |`)
    .join('\n');

  return `${BLOCK_START}
# CLI Tools

Reference docs for each tool are in \`${docsPath}/\`. Read the relevant file when you need detailed syntax.

| Tool | Purpose | Reference |
|------|---------|-----------|
${rows}

**Safety**: Before executing any SQL write operation (INSERT, UPDATE, DELETE, MERGE, TRUNCATE, DROP):
1. Check current context: \`sqlcmd config current-context\`
2. Show the context name and query to the user
3. Ask for explicit confirmation before executing

**Safety**: Every Jira, Confluence, or Assets operation must pass an explicit
\`atl --context <alias-or-hostname>\`. Never rely on or mutate atl's shared
persistent context from an agent session.

**Safety**: Before executing any M365 write or delete operation (add, set, remove, copy, move):
1. Show the full command and target URL to the user
2. Ask for explicit confirmation before executing
3. Do NOT use the \`--confirm\` flag unless specifically requested by the user

**Safety**: Before executing any hcloud destructive operation (\`delete\`, \`reset\`, \`poweroff\`):
1. Check active context: \`hcloud context active\`
2. Show the resource and target context to the user
3. Ask for explicit confirmation before executing
4. Never pass \`--yes\` autonomously to skip a delete prompt

**Safety**: Before executing any ovhcloud destructive operation (\`delete\`, \`terminate\`, \`reinstall\`, \`reboot\`):
1. Show the resource and target account/endpoint to the user
2. Ask for explicit confirmation before executing
3. Never pass a confirmation-skipping flag autonomously
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
  ensureDir(configDir);
  writeDocFiles(configDir);
  const existingContent = readFileSafe(configPath);
  const cliToolsBlock = generateCliToolsBlock(tool.dir);
  const newContent = replaceOrAppendBlock(existingContent, BLOCK_START, BLOCK_END, cliToolsBlock);
  fs.writeFileSync(configPath, newContent);
  return configPath;
};

/**
 * List of supported AI tools for display
 */
const SUPPORTED_TOOLS = [
  { name: 'Claude Code', config: '~/.claude/CLAUDE.md' },
  { name: 'Antigravity CLI', config: '~/.gemini/GEMINI.md' },
  { name: 'OpenAI Codex CLI', config: '~/.codex/AGENTS.md' },
];

/**
 * Configure LLM tools with block-based content injection
 * Writes individual doc files and a slim routing table
 */
export const configureLlmTools = async () => {
  console.log(chalk.cyan('\n=== LLM Configuration ===\n'));
  console.log(chalk.blue('Writing CLI reference docs for your AI coding assistants.'));
  console.log(chalk.gray('Each tool gets its own docs/ file — only loaded when needed.\n'));

  console.log(chalk.blue('Supported AI tools:'));
  for (const tool of SUPPORTED_TOOLS) {
    console.log(chalk.gray(`  • ${tool.name} → ${tool.config}`));
  }
  console.log();

  console.log(chalk.blue('Writing docs and routing table...'));

  let hasErrors = false;
  for (const tool of GLOBAL_LLM_TOOLS) {
    try {
      injectToLlmConfig(tool);
      const docCount = Object.keys(CLI_DOCS).length;
      console.log(chalk.green(`  ✓ ${tool.name}: ${docCount} doc files + routing table`));
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
  console.log(chalk.gray('Docs written to docs/ directories. Slim routing table in main config.'));
  return true;
};

/**
 * Export for direct access
 */
export {
  GLOBAL_LLM_TOOLS,
  CLI_DOCS,
  SUPPORTED_TOOLS,
  detectExistingConfig,
  BLOCK_START,
  BLOCK_END,
};
