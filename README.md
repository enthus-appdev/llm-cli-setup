# Enthus CLI Tools

A CLI tool to set up developer tools and configure AI coding assistants for Enthus developers.

## What This Installs

| Tool | Purpose |
|------|---------|
| **sqlcmd** | Microsoft SQL Server command-line tool |
| **sql-env** | Shell function to switch between database environments |
| **gh** | GitHub CLI for PR/issue management |
| **atl** | Atlassian CLI for Jira/Confluence |

Plus it configures your AI coding assistants (Claude Code, Codex) to know how to use these tools.

## Quick Start

### Option 1: npm (recommended)

```bash
npm install -g @enthus/cli-tools
enthus-cli-setup
```

### Option 2: npx (one-time use)

```bash
npx @enthus/cli-tools
```

### Option 3: Clone and run

```bash
git clone git@github.com:enthus-appdev/cli-tools.git
cd cli-tools
npm install
npm start
```

## Usage

### Interactive Mode (default)

```bash
enthus-cli-setup
```

Shows a menu to configure individual tools or run full setup.

### Command Line Options

```bash
enthus-cli-setup --full    # Run full setup
enthus-cli-setup --sql     # Configure SQL tools only
enthus-cli-setup --gh      # Configure GitHub CLI only
enthus-cli-setup --atl     # Configure Atlassian CLI only
enthus-cli-setup --llm     # Configure LLM tools only
```

## Tools Configured

### sql-env (SQL Environment Switcher)

Switch between database environments with a single command:

```bash
sql-env              # Show current environment
sql-env local        # Local Docker (localhost,1533)
sql-env stage        # Staging server
sql-env prod-ro      # Production read-only
sql-env prod-rw      # Production read-write
```

Then run queries without credentials:

```bash
sqlcmd -Q "SELECT @@VERSION"
sqlcmd -d Steps_Development -Q "SELECT TOP 10 * FROM sao.CUSTOMER_M"
```

**Security**: Passwords are stored in `~/.sql-env-credentials` with mode 0600.

### GitHub CLI (gh)

```bash
gh auth status                # Check authentication
gh pr list --author @me       # List your PRs
gh pr create --base master    # Create PR
gh issue view NX-1234         # View issue
```

### Atlassian CLI (atl)

```bash
atl auth status               # Check authentication
atl issue view NX-1234        # View Jira issue
atl issue list --assignee @me # List your issues
atl confluence page search X  # Search Confluence
```

## LLM Configuration

This tool teaches your AI coding assistants how to use these CLI tools by injecting documentation into their configuration files.

### Supported LLMs

| LLM | Config Location |
|-----|-----------------|
| Claude Code | `~/.claude/CLAUDE.md` |
| OpenAI Codex | `~/.codex/AGENTS.md` |

The documentation includes:
- Command syntax and examples
- Safety guidelines (e.g., confirm before SQL writes)
- Formatting guides (Jira wiki markup, Confluence HTML)

## Requirements

- **Node.js** 18+
- **macOS** or **Linux** (Windows not supported)
- **Package manager**: Homebrew (macOS) or apt/dnf (Linux)

## Project Structure

```
enthus-cli-tools/
├── bin/
│   └── cli.js              # Main entry point
├── lib/
│   ├── installers/
│   │   ├── sqlcmd.js       # sqlcmd + sql-env setup
│   │   ├── gh.js           # GitHub CLI setup
│   │   └── atl.js          # Atlassian CLI setup
│   ├── llm/
│   │   └── index.js        # LLM configuration
│   └── utils/
│       ├── platform.js     # Platform detection
│       └── shell.js        # Shell utilities
├── templates/
│   ├── claude-tools.md     # Claude Code template
│   └── codex-tools.md      # Codex template
├── package.json
└── README.md
```

## Development

```bash
# Install dependencies
npm install

# Run locally
npm start

# Link for global testing
npm link
enthus-cli-setup
```

## Troubleshooting

### sql-env: command not found

Run `source ~/.zshrc` (or your shell profile) after setup, or restart your terminal.

### atl installation fails

atl-cli requires GitHub CLI to be authenticated first. Run:

```bash
gh auth login
```

Then try again.

### Permission denied

Some operations require sudo. The script will prompt when needed.

## License

MIT - Internal use at Enthus
