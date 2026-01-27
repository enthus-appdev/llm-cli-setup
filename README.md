# llm-cli-setup

A CLI tool to set up developer tools and teach your AI coding assistants how to use them.

## What This Does

1. **Installs CLI tools**: sqlcmd, GitHub CLI (gh), Atlassian CLI (atl), n8nctl, grafanactl, logcli
2. **Configures sqlcmd contexts**: Named contexts for switching between database environments
3. **Teaches your AI assistants**: Injects CLI documentation into Claude Code, Gemini CLI, and Codex configs

| Tool           | Purpose                                                        |
| -------------- | -------------------------------------------------------------- |
| **sqlcmd**     | Microsoft SQL Server command-line tool with context management |
| **gh**         | GitHub CLI for PR/issue management                             |
| **atl**        | Atlassian CLI for Jira/Confluence                              |
| **n8nctl**     | n8n workflow automation CLI                                    |
| **grafanactl** | Grafana CLI for dashboard/resource management                  |
| **logcli**     | Loki CLI for querying Grafana Loki logs                        |

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
llm-cli-setup --n8n     # Configure n8n CLI only
llm-cli-setup --grafana # Configure Grafana CLI only
llm-cli-setup --logcli  # Configure Loki CLI only
llm-cli-setup --llm     # Configure LLM tools only
```

## Tools Configured

### sqlcmd (SQL Server CLI)

Switch between database contexts with native sqlcmd config:

```bash
sqlcmd config current-context        # Show current context
sqlcmd config use-context <name>     # Switch context (e.g., sqlcmd config use-context dev)
sqlcmd config get-contexts           # List all configured contexts
```

Then run queries:

```bash
sqlcmd query "SELECT @@VERSION"
sqlcmd query -d MyDatabase "SELECT TOP 10 * FROM Users"
```

**Adding contexts after setup**: You can add new contexts anytime using the setup tool or manually edit `~/.sqlcmd/sqlconfig`.

**Config file**: `~/.sqlcmd/sqlconfig` (YAML format, managed by go-sqlcmd)

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

### n8n CLI (n8nctl)

Installs from [enthus-appdev/n8nctl](https://github.com/enthus-appdev/n8nctl) by default. Override with `N8N_CLI_REPO` env var if needed.

```bash
n8nctl config init            # Interactive setup
n8nctl config list            # List configured instances
n8nctl workflow list          # List workflows
n8nctl workflow pull <id>     # Download workflow to file
n8nctl workflow push file.json # Upload workflow
n8nctl workflow run <id> -w   # Execute and wait
```

### Grafana CLI (grafanactl)

Requires Grafana 12+. Installs via `go install` or binary download.

```bash
grafanactl config check              # Verify configuration
grafanactl config use-context prod   # Switch context
grafanactl resources list            # List resource types
grafanactl resources get dashboards  # Get all dashboards
grafanactl resources pull dashboards -o ./dashboards/  # Backup
grafanactl resources push ./dashboards/                # Restore
```

### Loki CLI (logcli)

Installs from [grafana/loki](https://github.com/grafana/loki) GitHub releases.

```bash
# Set up environment variables
export LOKI_ADDR="<GRAFANA_URL>/api/datasources/proxy/<DATASOURCE_ID>"
export LOKI_BEARER_TOKEN="<GRAFANA_TOKEN>"

# Query logs
logcli labels k8s_deployment_name
logcli query '{k8s_deployment_name="myapp"}' --limit=20 --since=1h
```

## LLM Configuration

This tool teaches your AI coding assistants how to use these CLI tools by injecting documentation into their config files.

### Supported AI Tools

| AI Tool          | Config Location       |
| ---------------- | --------------------- |
| Claude Code      | `~/.claude/CLAUDE.md` |
| Gemini CLI       | `~/.gemini/GEMINI.md` |
| OpenAI Codex CLI | `~/.codex/CODEX.md`   |

### How It Works

1. Reads existing config file (if any)
2. Injects CLI documentation between block markers: `<!-- === CLI Tools === -->`
3. Preserves all your existing content outside the markers

The documentation includes:

- Command syntax and examples for sqlcmd, gh, atl, n8nctl, grafanactl, and logcli
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
│   │   ├── sqlcmd.js       # sqlcmd setup with context management
│   │   ├── gh.js           # GitHub CLI setup
│   │   ├── atl.js          # Atlassian CLI setup
│   │   ├── n8n.js          # n8n CLI setup
│   │   ├── grafanactl.js   # Grafana CLI setup
│   │   └── logcli.js      # Loki CLI setup
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

### atl installation fails

1. Make sure GitHub CLI is authenticated: `gh auth login`
2. Ensure you have access to the atl-cli repo (default: [enthus-appdev/atl-cli](https://github.com/enthus-appdev/atl-cli))

### atl auth fails

First-time users must run `atl auth setup` before `atl auth login`. This creates the OAuth app configuration.

### Go binaries not in PATH

All Go-based tools (atl, n8nctl, grafanactl) install to `~/go/bin`. Add to your shell profile:

```bash
export PATH="$PATH:$HOME/go/bin"
```

The setup tool will detect binaries in common locations even if not in PATH, but adding to PATH makes commands easier to use.

## License

MIT
