# CLI Tools

This document provides instructions for using CLI tools available in this development environment.

## SQL Server Access (sqlcmd + sql-env)

### Environment Switching

Use `sql-env` to switch between database environments before running queries:

```bash
sql-env              # Show current environment and available options
sql-env local        # Local Docker container (localhost,1433)
sql-env dev          # Development environment
sql-env stage        # Staging environment
sql-env prod         # Production (USE WITH CAUTION)
```

### Running Queries

After switching environments, run sqlcmd without credentials:

```bash
sqlcmd -Q "SELECT @@VERSION"
sqlcmd -d MyDatabase -Q "SELECT TOP 10 * FROM Users"
sqlcmd -i ./scripts/query.sql
```

### Safety Rules

**CRITICAL**: Before executing any write operation (INSERT, UPDATE, DELETE, MERGE, TRUNCATE, DROP):
1. Check current environment: `echo $SQL_ENV`
2. Show the environment name and query to the user
3. Ask for explicit confirmation before executing

## GitHub CLI (gh)

### Authentication

```bash
gh auth status    # Check authentication
gh auth login     # Re-authenticate if needed
```

### Pull Requests

```bash
gh pr create --base main --title "feat: Add new feature"
gh pr list --state open --author @me
gh pr view 123
gh pr checkout 123
gh pr merge 123 --squash
```

### Issues

```bash
gh issue list --label bug
gh issue view 456
gh issue create --title "Bug: ..." --label bug
```

### Repository Operations

```bash
gh repo view
gh repo clone owner/repo
```

### API Access

```bash
gh api repos/owner/repo/pulls/123/comments
```

## Atlassian CLI (atl)

Command-line tool for Jira and Confluence. Use `--json` for structured output.

### Authentication

```bash
atl auth status    # Check authentication
atl auth login     # Re-authenticate if needed
```

### Jira Issues

```bash
# View
atl issue view PROJ-1234
atl issue view PROJ-1234 --json
atl issue view PROJ-1234 --web

# List
atl issue list --assignee @me
atl issue list --project PROJ
atl issue list --jql "status = Open"

# Create
atl issue create --project PROJ --type Bug --summary "Title"
atl issue create --project PROJ --type Task --summary "Title" --description "Details"

# Edit
atl issue edit PROJ-1234 --summary "New summary"
atl issue edit PROJ-1234 --assignee @me

# Transitions
atl issue transition PROJ-1234 "In Progress"
atl issue transition PROJ-1234 --list

# Comments
atl issue comment PROJ-1234 --body "Comment text"
```

### Confluence

```bash
atl confluence space list
atl confluence page view <id>
atl confluence page list --space DOCS
atl confluence page search "query"
atl confluence page create --space DOCS --title "Title" --body "Content"
```

## Formatting Guidelines

### Jira Wiki Markup (NOT Markdown!)

Jira uses its own wiki syntax. Markdown does NOT work.

| What you want | Wrong (Markdown) | Correct (Jira) |
|---------------|------------------|----------------|
| Bold | `**bold**` | `*bold*` |
| Heading | `## Heading` | `h2. Heading` |
| Code block | ` ```code``` ` | `{code}code{code}` |
| Link | `[text](url)` | `[text\|url]` |
| Table | `\| a \| b \|` | `\|\|a\|\|b\|\|` |

Full syntax:
```
h1. Heading 1
h2. Heading 2

*bold* _italic_ -strikethrough- +underline+

* Bullet item
# Numbered item

{code:java}
code here
{code}

[Link text|https://example.com]
[PROJ-1234]  # Auto-links to issue

||Header 1||Header 2||
|Cell 1|Cell 2|
```

**Note**: Comments (`atl issue comment`) use plain text only - wiki markup doesn't render there.

### Confluence HTML

When editing Confluence pages via CLI, use HTML with Confluence macros:

```html
<h1>Heading</h1>
<p>Paragraph with <strong>bold</strong> and <code>inline code</code>.</p>
<ul><li>Bullet</li></ul>
```

For code blocks:
```html
<ac:structured-macro ac:name="code">
  <ac:plain-text-body><![CDATA[code here]]></ac:plain-text-body>
</ac:structured-macro>
```
