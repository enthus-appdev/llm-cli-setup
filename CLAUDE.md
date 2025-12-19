# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

This is a CLI tool (`dev-cli-tools`) that helps developers set up their development environment. It installs and configures:

- **sqlcmd + sql-env**: SQL Server CLI with environment switching
- **gh**: GitHub CLI
- **atl**: Atlassian CLI (Jira/Confluence)
- **LLM configs**: Documentation injection for Claude Code and Codex

## Development Commands

```bash
npm install     # Install dependencies
npm start       # Run the CLI
npm link        # Link globally for testing
```

## Architecture

### Entry Point
- `bin/cli.js` - Main CLI with interactive menu and command-line args

### Installers (`lib/installers/`)
- `sqlcmd.js` - sqlcmd installation + sql-env shell function
- `gh.js` - GitHub CLI installation and authentication
- `atl.js` - Atlassian CLI installation (configurable repo via ATL_CLI_REPO env var)

### LLM Configuration (`lib/llm/`)
- `index.js` - Detects LLM tools and injects documentation

### Templates (`templates/`)
- `claude-tools.md` - CLI docs for Claude Code
- `codex-tools.md` - CLI docs for OpenAI Codex

### Utilities (`lib/utils/`)
- `platform.js` - Package manager detection, command execution
- `shell.js` - Shell profile detection, file operations

## Key Patterns

### Block Markers
Configuration is injected between markers for safe updates:
- Claude: `<!-- === CLI Tools === -->` ... `<!-- === End CLI Tools === -->`
- Shell: `# === SQL Environment Switcher ===` ... `# === End ... ===`

### Credentials Security
SQL passwords stored in `~/.sql-env-credentials` with mode 0600, separate from shell profile.

### Configurable Repositories
atl-cli repo can be configured via `ATL_CLI_REPO` environment variable.

## Adding Support for New LLMs

1. Add entry to `LLM_TOOLS` in `lib/llm/index.js`
2. Create template in `templates/`
3. Define `configPath`, `blockStart`, `blockEnd`, `createWrapper`
