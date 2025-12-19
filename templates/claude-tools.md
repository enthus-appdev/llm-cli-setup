<!-- === CLI Tools === -->
## CLI Tools

This section documents CLI tools available for development.

### sqlcmd (SQL Server)

Use `sql-env` to switch between database environments:
```bash
sql-env              # Show current environment
sql-env local        # Local Docker (localhost,1433)
sql-env dev          # Development server
sql-env stage        # Staging server
sql-env prod         # Production (use with caution)
```

Then run queries without credentials:
```bash
sqlcmd -Q "SELECT @@VERSION"
sqlcmd -d MyDatabase -Q "SELECT TOP 10 * FROM Users"
sqlcmd -i ./scripts/query.sql
```

**IMPORTANT**: Always ask for user confirmation before executing write operations (INSERT, UPDATE, DELETE, MERGE, TRUNCATE, DROP). Check current environment with `echo $SQL_ENV` and show it with the query before executing.

### GitHub CLI (gh)

Authentication:
```bash
gh auth status                          # Check authentication
gh auth login                           # Re-authenticate if needed
```

Common commands:
```bash
# Pull Requests
gh pr create --base main --title "feat: Add new feature"
gh pr list --state open --author @me
gh pr view 123
gh pr checkout 123                      # Check out PR branch locally
gh pr merge 123 --squash

# Issues
gh issue list --label bug
gh issue view 456
gh issue create --title "Bug: ..." --label bug

# Repository
gh repo view
gh repo clone owner/repo

# API (for advanced queries)
gh api repos/owner/repo/pulls/123/comments
```

### Atlassian CLI (atl)

Command-line tool for Jira, Confluence, and Tempo. Use `--json` flag for structured output.

Authentication:
```bash
atl auth status                         # Check authentication status
atl auth login                          # Re-authenticate if needed
```

**Jira Issues:**
```bash
# View issues
atl issue view PROJ-1234                # View issue details
atl issue view PROJ-1234 --json         # View as JSON
atl issue view PROJ-1234 --web          # Open in browser

# List issues
atl issue list --assignee @me           # Your assigned issues
atl issue list --project PROJ           # Issues in project
atl issue list --jql "status = Open"    # Custom JQL query

# Create issues
atl issue create --project PROJ --type Bug --summary "Title"
atl issue create --project PROJ --type Task --summary "Title" --description "Details"
atl issue create --project PROJ --parent PROJ-123 --summary "Subtask"

# Edit issues
atl issue edit PROJ-1234 --summary "New summary"
atl issue edit PROJ-1234 --assignee @me
atl issue edit PROJ-1234 --add-label bug --remove-label wontfix
atl issue edit PROJ-1234 --field "Story Points=8"

# Transitions and workflow
atl issue transition PROJ-1234 "In Progress"
atl issue transition PROJ-1234 --list   # List available transitions

# Comments
atl issue comment PROJ-1234 --body "Comment text"
atl issue comment PROJ-1234 --list      # List comments

# Issue links
atl issue link PROJ-1234 PROJ-5678                  # Link issues (default: Relates)
atl issue link PROJ-1234 PROJ-5678 --type Blocks    # Link with specific type

# Web links
atl issue weblink PROJ-1234 --url "https://..." --title "Title"

# Sprint management
atl issue sprint PROJ-1234 --sprint-id 123          # Move to sprint
atl issue sprint PROJ-1234 --backlog                # Move to backlog
```

**Confluence:**
```bash
# Spaces
atl confluence space list               # List spaces

# Pages
atl confluence page view <id>           # View page by ID
atl confluence page view --space DOCS --title "Title"
atl confluence page list --space DOCS   # List pages in space
atl confluence page search "query"      # Search pages
atl confluence page create --space DOCS --title "New Page" --body "Content"
atl confluence page edit <id> --body "New content"
```

### Confluence Page Editing

**IMPORTANT:** When editing Confluence pages via `atl confluence page edit`, the body content must be HTML with Confluence macros for code blocks. Wiki markup does NOT work.

**What does NOT work:**
- `h1. Heading` - Wiki markup renders as literal text
- `{code}..{code}` - Wiki macro syntax doesn't work
- `<pre><code>...` - HTML code blocks render as plain text with broken formatting
- `||table||headers||` - Wiki table syntax breaks

**Use HTML with Confluence macros:**
```html
<h1>Heading</h1>
<h2>Subheading</h2>
<p>Paragraph with <strong>bold</strong> and <code>inline code</code>.</p>
<ul>
  <li>Bullet item</li>
</ul>
<table>
  <tr><th>Header</th></tr>
  <tr><td>Cell</td></tr>
</table>
<a href="https://example.com">Link text</a>
```

**For code blocks, use Confluence macro format:**
```html
<ac:structured-macro ac:name="code">
  <ac:plain-text-body><![CDATA[your code here
# Comments work correctly
multi-line code is preserved]]></ac:plain-text-body>
</ac:structured-macro>
```

**Tips:**
- The `--body` flag replaces the ENTIRE page content
- View the page first with `atl confluence page view <id>` to understand structure
- For complex pages, consider editing in the Confluence web UI instead
- Use `atl confluence page view <id> --web` to open in browser

### Jira Ticket Formatting

**IMPORTANT:** Jira uses its own wiki markup, NOT standard Markdown. Many common markdown features do NOT render correctly:

**What does NOT work in Jira:**
- `## Headings` - Use `h2.` instead
- `- [ ] Checkboxes` - Not supported, use plain lists
- `| Tables |` - Markdown tables don't render
- `**bold**` - Use `*bold*` instead
- `_italic_` - Use `_italic_` (same)
- ```code blocks``` - Use `{code}` blocks instead

**Jira wiki markup syntax:**
```
h1. Heading 1
h2. Heading 2
h3. Heading 3

*bold text*
_italic text_
-strikethrough-
+underline+

* Bullet list item
** Nested bullet
# Numbered list item
## Nested numbered

{code:java}
code block here
{code}

{noformat}
preformatted text
{noformat}

[Link text|https://example.com]
[PROJ-1234]                         # Auto-links to issue

||Header 1||Header 2||
|Cell 1|Cell 2|
|Cell 3|Cell 4|

{quote}
Quoted text
{quote}

{color:red}colored text{color}
```

**When writing via atl-cli:**
- *Comments* (`atl issue comment`): Use plain text only - wiki markup does NOT render
- *Descriptions* (`atl issue create/edit`): Wiki markup works
- Keep formatting simple - plain text with dash bullets works best for comments
- For issue descriptions, you can use `{code}` blocks and `*bold*`
<!-- === End CLI Tools === -->
