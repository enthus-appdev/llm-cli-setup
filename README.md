# llm-cli-setup

A CLI tool to set up developer tools and teach your AI coding assistants how to use them.

## What This Does

1. **Installs CLI tools**: sqlcmd, GitHub CLI (gh), Atlassian CLI (atl), n8nctl, gcx, m365, esq, discordctl, playwright, hcloud
2. **Configures sqlcmd contexts**: Named contexts for switching between database environments
3. **Teaches your AI assistants**: Injects CLI documentation into Claude Code, Antigravity, and Codex configs

| Tool           | Purpose                                                                             |
| -------------- | ----------------------------------------------------------------------------------- |
| **sqlcmd**     | Microsoft SQL Server command-line tool with context management                      |
| **gh**         | GitHub CLI for PR/issue management                                                  |
| **atl**        | Atlassian CLI for Jira/Confluence                                                   |
| **n8nctl**     | n8n workflow automation CLI                                                         |
| **gcx**        | Unified Grafana Cloud CLI (dashboards, resources, metrics, logs, traces, SLOs, IRM) |
| **m365**       | Microsoft 365 CLI for SharePoint/Teams/OneDrive management                          |
| **esq**        | Elasticsearch Query CLI for cross-environment cluster queries                       |
| **discordctl** | Discord CLI for REST API interactions (messages, reactions)                         |
| **playwright** | Browser automation for screenshots, PDFs, and web testing                           |
| **hcloud**     | Hetzner Cloud CLI for servers, networks, volumes, firewalls                         |

## Repository Overrides

Some tools install from other `enthus-appdev` repositories by default. To use your own forks instead, set these environment variables before running setup:

```bash
export ATL_CLI_REPO="your-org/atl-cli"           # Default: enthus-appdev/atl-cli
export N8N_CLI_REPO="your-org/n8n-cli"           # Default: enthus-appdev/n8n-cli
export ESQ_CLI_REPO="your-org/esq-cli"           # Default: enthus-appdev/esq-cli
export DISCORD_CLI_REPO="your-org/discordctl"    # Default: enthus-appdev/discordctl
export DISCORD_CLI_DIR="/path/to/discordctl"     # Default: ~/dev/discordctl
```

gcx installs from [grafana/gcx](https://github.com/grafana/gcx) GitHub releases by default. Override with `GCX_REPO` if needed. It is installed via a prebuilt binary download (no Go toolchain required).

The Go-based tools (atl, n8nctl, esq) are installed via `go install`. discordctl is installed via `npm link` from a local clone.

## Quick Start

```bash
git clone https://github.com/enthus-appdev/llm-cli-setup.git
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
llm-cli-setup --gcx     # Configure Grafana Cloud CLI (gcx) only
llm-cli-setup --m365    # Configure Microsoft 365 CLI only
llm-cli-setup --esq     # Configure Elasticsearch CLI only
llm-cli-setup --discord # Configure Discord CLI only
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
atl jira issue view PROJ-1234      # View Jira issue
atl jira issue list --assignee @me # List your issues
atl confluence page search X  # Search Confluence
```

### n8n CLI (n8nctl)

Installs from [enthus-appdev/n8n-cli](https://github.com/enthus-appdev/n8n-cli) by default. Override with `N8N_CLI_REPO` env var if needed.

```bash
n8nctl config init            # Interactive setup
n8nctl config list            # List configured instances
n8nctl workflow list          # List workflows
n8nctl workflow pull <id>     # Download workflow to file
n8nctl workflow push file.json # Upload workflow
n8nctl workflow run <id> -w   # Execute and wait
n8nctl workflow run <id> --webhook <path>  # Trigger via webhook
n8nctl variable list          # List variables
n8nctl variable create k --value 'v'  # Create (--value avoids shell expansion)
```

### Grafana Cloud CLI (gcx)

Installs the latest [gcx](https://github.com/grafana/gcx) release binary from GitHub (no Go toolchain required). gcx is the unified Grafana Cloud CLI and replaces the old `grafanactl` (Grafana) and `logcli` (Loki) CLIs.

```bash
gcx --version                    # Show version
gcx login prod --server <url>    # Log in (browser OAuth) & create context
gcx config check                 # Verify configuration
gcx config use-context prod      # Switch context
gcx resources list-types         # List resource types
gcx logs query '{service_name="myapp"}' --since=1h   # Query Loki logs
gcx metrics query 'rate(http_requests_total[5m])'      # Query Prometheus
gcx dashboards list              # List dashboards
```

### Microsoft 365 CLI (m365)

Installs via npm from [pnp/cli-microsoft365](https://github.com/pnp/cli-microsoft365).

```bash
m365 login                        # Login with device code flow
m365 status                       # Check authentication status
m365 spo site list                # List SharePoint sites
m365 spo file list --webUrl <url> --folder "Shared Documents"
```

### Elasticsearch Query CLI (esq)

Installs from [enthus-appdev/esq-cli](https://github.com/enthus-appdev/esq-cli) by default. Override with `ESQ_CLI_REPO` env var if needed.

```bash
esq config add prod --url <url>   # Add environment
esq config use prod               # Switch environment
esq search documents "query"      # Search with Lucene syntax
esq health                        # Cluster health
```

### Discord CLI (discordctl)

Installs from [enthus-appdev/discordctl](https://github.com/enthus-appdev/discordctl) by default via `npm link` from a local clone. Override with `DISCORD_CLI_REPO` and `DISCORD_CLI_DIR` env vars if needed.

```bash
discordctl config init                    # Interactive setup
discordctl msg list <channel>             # Read messages
discordctl msg send <channel> "text"      # Send a message
discordctl react add <channel> <id> 👍    # Add reaction
```

## LLM Configuration

This tool teaches your AI coding assistants how to use these CLI tools by injecting documentation into their config files.

### Supported AI Tools

| AI Tool          | Config Location       |
| ---------------- | --------------------- |
| Claude Code      | `~/.claude/CLAUDE.md` |
| Antigravity      | `~/.gemini/GEMINI.md` |
| OpenAI Codex CLI | `~/.codex/AGENTS.md`  |

### How It Works

1. Reads existing config file (if any)
2. Injects CLI documentation between block markers: `<!-- === CLI Tools === -->`
3. Preserves all your existing content outside the markers

The documentation includes:

- Command syntax and examples for sqlcmd, gh, atl, n8nctl, gcx, m365, esq, discordctl, playwright, and hcloud
- Safety guidelines (e.g., confirm before SQL writes)
- Formatting guides (Jira Markdown/ADF, Confluence HTML)

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
│   ├── index.js            # Library entry point (exports for environment-setup)
│   ├── installers/
│   │   ├── index.js        # Installer exports
│   │   ├── sqlcmd.js       # sqlcmd setup with context management
│   │   ├── gh.js           # GitHub CLI setup
│   │   ├── atl.js          # Atlassian CLI setup
│   │   ├── n8n.js          # n8n CLI setup
│   │   ├── gcx.js          # Grafana Cloud CLI setup
│   │   ├── m365.js         # Microsoft 365 CLI setup
│   │   ├── esq.js          # Elasticsearch Query CLI setup
│   │   └── discord.js      # Discord CLI setup
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

### gcx binary not in PATH

gcx installs to `~/.local/bin`. Add to your shell profile if not already on PATH:

```bash
export PATH="$PATH:$HOME/.local/bin"
```

The Go-based tools (atl, n8nctl, esq) install to `~/go/bin`:

```bash
export PATH="$PATH:$HOME/go/bin"
```

The setup tool will detect binaries in common locations even if not in PATH, but adding to PATH makes commands easier to use.

## License

MIT
