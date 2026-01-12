# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

This is a CLI tool (`llm-cli-setup`) that helps developers set up CLI tools and teaches their AI coding assistants how to use them. It installs and configures:

- **sqlcmd**: SQL Server CLI with native context management
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
- `sqlcmd.js` - go-sqlcmd installation + context configuration
- `gh.js` - GitHub CLI installation and authentication
- `atl.js` - Atlassian CLI installation (requires ATL_CLI_REPO env var)

### LLM Configuration (`lib/llm/`)
- `index.js` - Injects CLI documentation into LLM config files using block markers

### Utilities (`lib/utils/`)
- `platform.js` - Package manager detection, command execution
- `shell.js` - Shell profile detection, block marker operations, file utilities

## Key Patterns

### Block Markers
LLM config is injected between markers for safe updates (preserves user content):
- `<!-- === CLI Tools === -->` ... `<!-- === End CLI Tools === -->`

### sqlcmd Contexts
Uses native go-sqlcmd config management (`~/.sqlcmd/sqlconfig`). No shell functions needed.

### Configurable Repositories
atl-cli repo must be configured via `ATL_CLI_REPO` environment variable.

## Adding Support for New LLMs

1. Add entry to `GLOBAL_LLM_TOOLS` in `lib/llm/index.js` with `name`, `dir`, and `file`
2. Add display entry to `SUPPORTED_TOOLS` array
3. The block marker injection will automatically handle the new tool
