# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

`llm-cli-setup` serves two purposes:

1. **Standalone CLI** (`npm start` / `llm-cli-setup`) - interactive menu for developers to install and configure CLI tools
2. **Library** (`import from 'llm-cli-setup'`) - consumed by `environment-setup` to provide CLI tool setup as part of the broader dev environment onboarding

## CRITICAL: Two Entry Points

This project has **two separate entry points** that BOTH need updating when adding features:

| File | Purpose | Who uses it |
|------|---------|-------------|
| `bin/cli.js` | Standalone CLI menu, `--flags`, step counter | Developers running `npm start` or `llm-cli-setup` directly |
| `lib/index.js` | Library exports, `configureShellEnv()`, `CLI_TOOLS` array, status display | `environment-setup` via `import { configureShellEnv } from 'llm-cli-setup'` |

**`lib/index.js` contains `configureShellEnv()`** which is what environment-setup calls. This function has its own `CLI_TOOLS` array with status checks, configure functions, and the tool selection menu. This is SEPARATE from `bin/cli.js`.

## Development Commands

```bash
npm install     # Install dependencies
npm start       # Run the standalone CLI
npm link        # Link globally for testing (use in environment-setup: npm link llm-cli-setup)
```

## Architecture

### Standalone CLI (`bin/cli.js`)
- Interactive menu with tool selection
- `--flag` shortcuts (e.g., `--sql`, `--gh`, `--esq`)
- Full setup wizard with step counter
- Imports individual configure functions from `lib/installers/`

### Library Entry Point (`lib/index.js`)
- Re-exports all installer functions, status checks, and utilities
- Contains `configureShellEnv()` - the main function environment-setup calls
- Contains `CLI_TOOLS` array - defines tool status display and selection menu
- This is what developers see when they pick "Configure CLI tools" in environment-setup

### Installers (`lib/installers/`)

Each tool has its own module following the same pattern:
- `findBinary()` - locate installed binary (PATH + common locations)
- `is*Installed()` / `is*Configured()` - status checks
- `install*()` - installation via `go install` or package manager
- `configure*()` - interactive setup flow (install prompt, config, status display)

Current tools: `sqlcmd.js`, `gh.js`, `atl.js`, `n8n.js`, `grafanactl.js`, `logcli.js`, `m365.js`, `esq.js`, `discord.js`

### LLM Configuration (`lib/llm/index.js`)
- `CLI_TOOLS_DOCS` - markdown documentation for all CLI tools (injected into LLM configs)
- `configureLlmTools()` - injects docs into `~/.claude/CLAUDE.md`, `~/.gemini/GEMINI.md`, `~/.codex/CODEX.md`
- Uses block markers: `<!-- === CLI Tools === -->` ... `<!-- === End CLI Tools === -->`

### Utilities (`lib/utils/`)
- `platform.js` - package manager detection, command execution
- `shell.js` - shell profile detection, block marker operations, file utilities

## Adding a New CLI Tool

**You must update ALL of these files:**

1. **`lib/installers/<tool>.js`** - Create installer module (copy `n8n.js` or `esq.js` as template)
2. **`lib/installers/index.js`** - Add exports
3. **`lib/index.js`** - Add to top-level exports AND add entry to `CLI_TOOLS` array (status check + configure function)
4. **`lib/llm/index.js`** - Add usage documentation to `CLI_TOOLS_DOCS` string, update tool list in description strings
5. **`bin/cli.js`** - Add import, menu entry, `--flag`, switch case, full setup step (update step count!)

Missing any of these (especially `lib/index.js`) will cause the tool to not appear in environment-setup.

## Adding Support for New LLMs

1. Add entry to `GLOBAL_LLM_TOOLS` in `lib/llm/index.js` with `name`, `dir`, and `file`
2. Add display entry to `SUPPORTED_TOOLS` array
3. The block marker injection will automatically handle the new tool

## Key Patterns

### Private Go Repos
Tools installed via `go install` from private repos (atl, n8n, esq) need:
- `GOPRIVATE=github.com/enthus-appdev/*`
- Git SSH config: `url."git@github.com:".insteadOf "https://github.com/"`
- Repo configurable via env var (e.g., `ESQ_CLI_REPO`)

### Block Markers
LLM config is injected between HTML comment markers for safe updates. Consuming packages (e.g., environment-setup) may use their own SEPARATE marker pair for additional internal content.
