# Contributing

Thanks for your interest in improving this MCP server. This is a small,
focused project — a read-only Model Context Protocol server over a public
data source — so the contribution flow is light.

## Getting started

```bash
npm install      # install dependencies
npm run build    # compile to dist/
npm start        # run the stdio server
```

To exercise the tools interactively:

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

## Before opening a pull request

- Run `npm run build` and make sure it passes. If the repo has a
  `test` or `typecheck` script, run those too.
- Keep changes scoped. One logical change per PR.
- Add a bullet under `## [Unreleased]` in `CHANGELOG.md` for anything a
  consumer would notice (a new tool, a changed input/output shape, a bug
  fix). Pure refactors don't need an entry.
- Use [Conventional Commits](https://www.conventionalcommits.org/)
  prefixes (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, `test:`,
  `ci:`). The body explains *why*, not *what*.

## Reporting bugs and requesting features

Open an issue using the bug-report or feature-request template. For
security issues, follow [SECURITY.md](SECURITY.md) instead of opening a
public issue.

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By
participating you are expected to uphold it.
