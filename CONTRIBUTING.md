# Contributing to llm-cli-setup

Thanks for your interest in contributing! Here's how to get started.

## Development Setup

```bash
git clone https://github.com/enthus-appdev/llm-cli-setup.git
cd llm-cli-setup
npm install
npm start         # Run the CLI
npm run lint      # Run ESLint
npm run format    # Format with Prettier
```

Requires Node.js 18+.

## Making Changes

1. Fork the repository and create a feature branch from `main`
2. Write your code following the existing patterns
3. Run `npm run lint && npm run check-format` to ensure all checks pass
4. Commit with a clear message describing the change
5. Open a pull request against `main`

## Adding a New CLI Tool

See `CLAUDE.md` for the full checklist — there are 5 files that need updating when adding a new tool.

## Code Style

- ESLint and Prettier are configured — run `npm run lint` and `npm run format`
- Use ES modules (`import`/`export`)
- Follow the existing installer pattern in `lib/installers/`

## Reporting Bugs

Open a [GitHub issue](https://github.com/enthus-appdev/llm-cli-setup/issues) with:

- Steps to reproduce
- Expected vs actual behavior
- Node.js version and OS

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
