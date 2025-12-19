# llm-cli-setup

A CLI tool to set up developer tools and teach your AI coding assistants how to use them.

## What This Does

1. **Installs CLI tools**: sqlcmd, GitHub CLI (gh), Atlassian CLI (atl)
2. **Configures sql-env**: Shell function to switch between database environments
3. **Teaches your AI assistants**: Injects CLI documentation into Claude Code, Gemini CLI, and Codex configs

| Tool | Purpose |
|------|---------|
| **sqlcmd** | Microsoft SQL Server command-line tool |
| **sql-env** | Shell function to switch between database environments |
| **gh** | GitHub CLI for PR/issue management |
| **atl** | Atlassian CLI for Jira/Confluence |

## Quick Start

```bash
git clone git@github.com:enthus-appdev/llm-cli-setup.git
cd llm-cli-setup
npm install
npm start
```

## Usage

### Interactive Mode (default)

```bash
llm-cli-setup
```

Shows a menu to configure individual tools or run full setup.

### Command Line Options

```bash
llm-cli-setup --full    # Run full setup
llm-cli-setup --sql     # Configure SQL tools only
llm-cli-setup --gh      # Configure GitHub CLI only
llm-cli-setup --atl     # Configure Atlassian CLI only
llm-cli-setup --llm     # Configure LLM tools only
```

## Tools Configured

### sql-env (SQL Environment Switcher)

Switch between database environments with a single command:

```bash
sql-env              # Show current environment
sql-env local        # Local Docker (localhost,1433)
sql-env dev          # Development server
sql-env stage        # Staging server
sql-env prod-ro      # Production read-only
sql-env prod         # Production read-write (use with caution)
```

Then run queries without credentials:

```bash
sqlcmd -Q "SELECT @@VERSION"
sqlcmd -d MyDatabase -Q "SELECT TOP 10 * FROM Users"
```

**Security**: Passwords are stored in `~/.sql-env-credentials` with mode 0600.

### GitHub CLI (gh)

```bash
gh auth status                # Check authentication
gh pr list --author @me       # List your PRs
gh pr create --base main      # Create PR
gh issue view 123             # View issue
```

### Atlassian CLI (atl)

```bash
atl auth setup                # First-time OAuth setup (required once)
atl auth login                # Authenticate (opens browser)
atl issue view PROJ-1234      # View Jira issue
atl issue list --assignee @me # List your issues
atl confluence page search X  # Search Confluence
```

## LLM Configuration

This tool teaches your AI coding assistants how to use these CLI tools by injecting documentation into their config files.

### Supported AI Tools

| AI Tool | Config Location |
|---------|-----------------|
| Claude Code | `~/.claude/CLAUDE.md` |
| Gemini CLI | `~/.gemini/GEMINI.md` |
| OpenAI Codex CLI | `~/.codex/CODEX.md` |

### How It Works

1. Reads existing config file (if any)
2. Injects CLI documentation between block markers: `<!-- === CLI Tools === -->`
3. Preserves all your existing content outside the markers

The documentation includes:
- Command syntax and examples for sqlcmd, sql-env, gh, and atl
- Safety guidelines (e.g., confirm before SQL writes)
- Formatting guides (Jira wiki markup, Confluence HTML)

**Your existing configuration is safe** - only content between the CLI Tools markers is modified.

## Requirements

- **Node.js** 18+
- **macOS** or **Linux** (Windows not supported)
- **Package manager**: Homebrew (macOS) or apt/dnf (Linux)

## Project Structure

```
llm-cli-setup/
├── bin/
│   └── cli.js              # Main entry point
├── lib/
│   ├── installers/
│   │   ├── sqlcmd.js       # sqlcmd + sql-env setup
│   │   ├── gh.js           # GitHub CLI setup
│   │   └── atl.js          # Atlassian CLI setup
│   ├── llm/
│   │   └── index.js        # LLM configuration with block markers
│   └── utils/
│       ├── platform.js     # Platform detection
│       └── shell.js        # Shell utilities
├── package.json
└── README.md
```

## Development

```bash
npm install   # Install dependencies
npm start     # Run the CLI
```

## Troubleshooting

### sql-env: command not found

Run `source ~/.bashrc` (or `source ~/.zshrc` for zsh) after setup, or restart your terminal.

### atl installation fails

1. Make sure GitHub CLI is authenticated first: `gh auth login`
2. Ensure you have access to the atl-cli repo (default: `enthus-appdev/atl-cli`)

### atl auth fails

First-time users must run `atl auth setup` before `atl auth login`. This creates the OAuth app configuration.

### Permission denied

Some operations require sudo. The script will prompt when needed.

## License

MIT
