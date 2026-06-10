# Contributing to node-i3x

Thank you for your interest in contributing to **node-i3x**!
We welcome contributions from the community to help make this the
best OPC UA → REST bridge for industrial automation.

By participating in this project, you agree to abide by our
[Code of Conduct](#code-of-conduct).

## Table of Contents

- [How to Contribute](#how-to-contribute)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Code Review Process](#code-review-process)
- [Contributor License Agreement (CLA)](#contributor-license-agreement-cla)
- [Code of Conduct](#code-of-conduct)

---

## How to Contribute

### Reporting Bugs

- Search existing [Issues](../../issues) to see if the bug has
  already been reported.
- If not, create a new issue with:
  - A clear description of the problem
  - Steps to reproduce
  - Your Node.js version and OS
  - A minimal reproducible example when possible

### Suggesting Enhancements

- **Discuss first** — open an issue tagged `enhancement` before
  writing code. This ensures alignment with the project roadmap and
  architecture.
- Describe the use case, expected behavior, and how it relates to
  the i3X specification or OPC UA.

### Pull Requests

1. Fork the repository.
2. Create a feature branch from `master`.
3. Make your changes (see [Development Workflow](#development-workflow)).
4. Ensure all tests pass and linting is clean.
5. Submit a pull request with a clear description of the changes.
6. **Sign the CLA** (see [below](#contributor-license-agreement-cla)).

---

## Development Workflow

We use **npm workspaces** for the monorepo.

```bash
# Clone and install
git clone <your-fork-url>
cd node-i3x
npm install

# Run the full test suite (101 tests)
npm test

# TypeScript type checking
npm run typecheck

# Lint and format (Biome)
npm run lint
npm run lint:fix     # auto-fix safe issues

# Build all packages (tsup)
npm run build
```

### Project Structure

```
packages/
  core/                   # Domain models, ports, services
  opcua-connector/        # OPC UA client adapter (remote)
  pseudo-session-connector/ # PseudoSession adapter (embedded)
  rest-server/            # Fastify REST routes
  app/                    # Composition root
  demo-embedded/          # Live demo with dashboard
```

---

## Coding Standards

- **Language**: TypeScript (strict mode, ESM-only)
- **Formatter / Linter**: [Biome](https://biomejs.dev/) — run
  `npm run lint` before committing
- **Style**: 2-space indent, single quotes, trailing commas,
  semicolons, 90-char line width
- **Naming**: camelCase for variables/functions, PascalCase for
  types/classes
- **Architecture**: Hexagonal (ports & adapters) — domain logic
  in `core`, adapters in `opcua-connector`/`pseudo-session-connector`/
  `rest-server`
- **Comments**: Preserve existing comments and docstrings unless
  directly related to your change

### AI-Assisted Contributions

We accept AI-assisted contributions (Copilot, ChatGPT, etc.)
provided that:

- You have **reviewed and understood** every line of the generated
  code.
- The code meets our coding standards and test coverage
  requirements.
- You can explain the changes during code review.
- You remain the **responsible author** and sign the CLA for the
  contribution.

---

## Testing

- **Framework**: [Vitest](https://vitest.dev/)
- **Expectation**: All new features and bug fixes must include tests.
- **Coverage**: Do not reduce existing test coverage.

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch
```

### Test Categories

| Package | Test type | What it covers |
|---------|-----------|----------------|
| `core` | Unit | Stable ID generation, model building, services |
| `opcua-connector` | Unit | Namespace mapping, node conversion |
| `pseudo-session-connector` | Integration | AddressSpace subscriptions, polling |
| `app` | E2E | Full OPC UA server → REST API pipeline |

---

## Code Review Process

- **Every pull request** is reviewed by a project maintainer.
- We may request changes to architecture, naming, test coverage,
  or documentation — this is normal and ensures quality.
- Be patient — this is an industrial-grade project and review takes
  time.

---

## Contributor License Agreement (CLA)

### Why a CLA?

node-i3x is **dual-licensed** under the
[AGPL-3.0-or-later](LICENSE) and a
[Sterfive Commercial License](LICENSING.md). This dual-licensing
model is essential to the project's sustainability:

- The **AGPL** ensures the software remains open -- any derivative work
  or network-accessible deployment must also share its source code under
  the same terms.
- The **Commercial License** allows industrial and SaaS users to
  deploy without AGPL copyleft obligations, funding ongoing development.

For this to work, **Sterfive must hold the rights to relicense all
contributed code** under the commercial license. The CLA grants
Sterfive this right while you retain full ownership of your
contribution.

### What You Agree To

By submitting a pull request, you agree to the following terms:

> **1. Grant of Rights.** You grant to **Sterfive SAS** a
> perpetual, worldwide, non-exclusive, royalty-free, irrevocable
> license to use, reproduce, modify, distribute, sublicense, and
> relicense your contribution, in source code or object code form,
> under any license — including the AGPL-3.0-or-later and the
> Sterfive Commercial License.
>
> **2. Ownership.** You retain ownership of your contribution. This
> CLA does not transfer copyright — it grants a license.
>
> **3. Original Work.** You represent that your contribution is your
> original work (or you have the right to submit it), and that it
> does not violate any third-party rights.
>
> **4. No Warranty.** Your contribution is provided AS-IS, without
> warranty of any kind.
>
> **5. Employer.** If your employer has rights to intellectual
> property that you create, you represent that you have received
> permission to make the contribution on behalf of your employer,
> or that your employer has waived such rights.

### How to Sign

By submitting a pull request, you signify that you have read and
agree to the terms above. Include the following line in your first
commit message:

```
Signed-off-by: Your Name <your-email@example.com>
```

This follows the [Developer Certificate of Origin](https://developercertificate.org/)
convention (`git commit -s` adds it automatically).

If you have questions about the CLA, contact us at
**[contact@sterfive.com](mailto:contact@sterfive.com)**.

---

## Code of Conduct

We are committed to providing a welcoming, inclusive, and
harassment-free experience for everyone.

- Be respectful and constructive in all interactions.
- Focus on the technical merit of contributions.
- No harassment, discrimination, or personal attacks.
- Report unacceptable behavior to
  **[contact@sterfive.com](mailto:contact@sterfive.com)**.

---

## Questions?

- 📧 **Email**: [contact@sterfive.com](mailto:contact@sterfive.com)
- 🌐 **Website**: [sterfive.com](https://sterfive.com)
- 📖 **i3X Spec**: [i3X specification](../../)

---

*Thank you for helping make node-i3x better!*

*— The Sterfive team*
