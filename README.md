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
git clone https://github.com/your-org/llm-cli-setup.git
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
sql-env              # Show current environment and list available
sql-env <name>       # Switch to environment (e.g., sql-env dev)
sql-env add          # Add a new environment (interactive prompts)
sql-env remove <name> # Remove an environment
sql-env list         # List all configured environments
```

Then run queries without credentials:

```bash
sqlcmd -Q "SELECT @@VERSION"
sqlcmd -d MyDatabase -Q "SELECT TOP 10 * FROM Users"
```

**Adding environments after setup**: You can add new environments anytime without re-running the setup tool:

```bash
sql-env add my-custom-env
# Prompts for: display name, server, username, password, database, read-only mode
```

**Read-only mode**: When enabled for an environment, sqlcmd automatically uses `-K ReadOnly` (ApplicationIntent=ReadOnly). This prevents accidental writes to production databases without needing separate read-only database users.

```bash
sql-env prod-ro              # Switches and shows [READ-ONLY]
sqlcmd -Q "SELECT 1"         # Automatically adds -K ReadOnly
```

**Files**:
- `~/.sql-env/sql-env.sh` - Shell script (sourced from profile)
- `~/.sql-env.json` - Environment configuration (server, user, database, readonly)
- `~/.sql-env-credentials` - Passwords (mode 0600, never committed)

### GitHub CLI (gh)

```bash
gh auth status                # Check authentication
gh pr list --author @me       # List your PRs
gh pr create --base main      # Create PR
gh issue view 123             # View issue
```

### Atlassian CLI (atl)

Installs from [enthus-appdev/atl-cli](https://github.com/enthus-appdev/atl-cli) by default. Override with `ATL_CLI_REPO` env var if needed.

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
- Command syntax and examples for sqlcmd, sql-env, gh, atl, and n8nctl
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

After initial setup, you need to reload your shell configuration:

```bash
source ~/.zshrc    # for zsh
source ~/.bashrc   # for bash
```

Or simply open a new terminal. You only need to do this once after installing the function.

### atl installation fails

1. Make sure GitHub CLI is authenticated: `gh auth login`
2. Ensure you have access to the atl-cli repo (default: [enthus-appdev/atl-cli](https://github.com/enthus-appdev/atl-cli))

### atl auth fails

First-time users must run `atl auth setup` before `atl auth login`. This creates the OAuth app configuration.

### Permission denied

Some operations require sudo. The script will prompt when needed.

## License

MIT
