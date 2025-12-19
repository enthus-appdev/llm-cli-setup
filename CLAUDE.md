# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

This is a CLI tool (`llm-cli-setup`) that helps developers set up CLI tools and teaches their AI coding assistants how to use them. It installs and configures:

- **sqlcmd + sql-env**: SQL Server CLI with environment switching
- **gh**: GitHub CLI
- **atl**: Atlassian CLI (Jira/Confluence)
- **LLM configs**: Documentation injection for Claude Code, Gemini CLI, and Codex

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
- `atl.js` - Atlassian CLI installation (requires ATL_CLI_REPO env var)

### LLM Configuration (`lib/llm/`)
- `index.js` - Injects CLI documentation into LLM config files using block markers

### Utilities (`lib/utils/`)
- `platform.js` - Package manager detection, command execution
- `shell.js` - Shell profile detection, block marker operations, file utilities

## Key Patterns

### Block Markers
Configuration is injected between markers for safe updates (preserves user content):
- LLM configs: `<!-- === CLI Tools === -->` ... `<!-- === End CLI Tools === -->`
- Shell profile: `# === SQL Environment Switcher ===` ... `# === End SQL Environment Switcher ===`

### Credentials Security
SQL passwords stored in `~/.sql-env-credentials` with mode 0600, separate from shell profile.

### Configurable Repositories
atl-cli repo must be configured via `ATL_CLI_REPO` environment variable.

## Adding Support for New LLMs

1. Add entry to `GLOBAL_LLM_TOOLS` in `lib/llm/index.js` with `name`, `dir`, and `file`
2. Add display entry to `SUPPORTED_TOOLS` array
3. The block marker injection will automatically handle the new tool
