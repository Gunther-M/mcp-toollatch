# Contributing

Thanks for your interest in MCP ToolLatch. The project is pre-alpha, so the best contributions are small, well-scoped, and easy to review.

## Development Setup

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test
pnpm lint
```

## Contribution Guidelines

- Open an issue before large design or architecture changes.
- Keep pull requests focused on one behavior or package.
- Add or update tests when changing behavior.
- Do not commit secrets, local policy files containing private paths, tokens, certificates, or `.env` files.
- Use clear commit messages. Conventional commit style is welcome.

## Security-Sensitive Changes

Changes to policy evaluation, proxy behavior, audit logs, or risk rules should include a short explanation of the security boundary they affect.
