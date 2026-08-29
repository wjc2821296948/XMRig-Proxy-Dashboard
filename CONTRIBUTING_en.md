# Contributing Guide / 贡献指南

[English](CONTRIBUTING_en.md) | [中文](CONTRIBUTING.md)

---

# Contributing Guide

Thank you for your interest in XMRig Proxy Dashboard! We welcome all forms of contributions, including but not limited to:

- 🐛 Bug reports
- 💡 Feature suggestions
- 📝 Documentation improvements
- 🔧 Code contributions (fixes, refactoring, new features)
- 🧪 Test cases
- 🌐 Translations/localization

---

## 📋 Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Getting Started](#getting-started)
3. [Issue Reporting Guide](#issue-reporting-guide)
4. [Pull Request Process](#pull-request-process)
5. [Code Conventions](#code-conventions)
6. [Commit Message Conventions](#commit-message-conventions)
7. [Branch Strategy](#branch-strategy)
8. [Code Review Checklist](#code-review-checklist)
9. [Testing Requirements](#testing-requirements)
10. [Release Process](#release-process)

---

## 🤝 Code of Conduct

This project follows the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/) Code of Conduct. By participating, you agree to uphold its terms. Please respect all contributors and maintain a friendly, inclusive environment.

---

## 🚀 Getting Started

### Requirements

- Modern browser (ES Modules support)
- Any static file server (optional, for local preview)
- Git
- Code editor (VS Code recommended)

### Local Development

```bash
# 1. Fork the repository to your GitHub account
# 2. Clone your fork
git clone https://github.com/YOUR_USERNAME/XMRig-Proxy-Dashboard.git
cd XMRig-Proxy-Dashboard

# 3. Create a feature branch
git checkout -b feat/your-feature-name
# or a fix branch
git checkout -b fix/your-fix-name

# 4. Start local preview (choose one)
# Python 3
python3 -m http.server 8000
# Node.js (npx serve)
npx serve .
# VS Code Live Server extension
# Or simply double-click index.html (but API requests may fail due to CORS)

# 5. Visit http://localhost:8000 in your browser
```

### Project Structure Overview

```
xmrig-proxy-dashboard/
├── index.html          # Entry HTML
├── styles.css          # Complete styles (CSS variables, responsive, animations)
├── CONTRIBUTING.md     # Chinese guide
├── CONTRIBUTING_en.md  # English guide (this file)
├── README.md           # Chinese documentation
├── README.en.md        # English documentation
├── CLAUDE.md           # Project memory (for AI collaboration reference)
├── .gitignore
└── src/
    ├── main.js         # App entry, state machine, event binding
    ├── api.js          # Unified API request wrapper (auth, timeout, error normalization)
    ├── storage.js      # Config storage abstraction (localStorage / sessionStorage)
    └── ui.js           # UI components (Skeleton, Toast, render utilities)
```

---

## 🐛 Issue Reporting Guide

### Search Existing Issues

Before creating a new issue, please search the [Issues list](https://github.com/wjc2821296948/XMRig-Proxy-Dashboard/issues) to confirm whether a similar report already exists.

### Bug Report Template

When creating a bug report, please include the following information:

```markdown
## 🐛 Bug Description

Clear and concise description of the problem.

## 🔄 Steps to Reproduce

1. Go to '...'
2. Click on '....'
3. Scroll down to '....'
4. See error

## ✅ Expected Behavior

Describe what you expected to happen.

## 📱 Environment

- OS: [e.g., Windows 11, macOS 14, Ubuntu 22.04]
- Browser: [e.g., Chrome 120, Firefox 121, Safari 17]
- XMRig Proxy version: [e.g., 6.21.0]
- Dashboard deployment: [e.g., GitHub Pages, local file, Nginx]

## 📷 Screenshots/Recording

If applicable, add screenshots or recordings to help explain the problem.

## 📋 Additional Information

Any other configuration, logs, network request screenshots, etc. that help locate the issue.
```

### Feature Request Template

```markdown
## 💡 Feature Request

### Problem Context

Describe what problem this feature would solve, or what experience it would improve.

### Proposed Solution

Clearly describe your desired implementation.

### Alternatives Considered

Other implementations you've considered (if any).

### Priority

- [ ] High - Core functionality missing / severe UX issue
- [ ] Medium - Important improvement / common scenario optimization
- [ ] Low - Nice to have / niche requirement

### Related Issues/PRs

Related issue numbers or PR links (if any).
```

---

## 🔄 Pull Request Process

### Pre-PR Checklist

- [ ] Code passes ESLint/Prettier checks (if configured)
- [ ] No `console.log`/`console.debug` leftovers (debug code cleaned up)
- [ ] Token-related logs are masked (`Bearer **********`)
- [ ] All dynamic content processed through `escapeHtml()`
- [ ] New features have corresponding documentation updates (README/comments)
- [ ] No breaking changes, or migration path documented in PR description
- [ ] Self-tested: local preview works, real Proxy connection test passes

### PR Title Convention

Follow [Conventional Commits](https://www.conventionalcommits.org/):

| Type | Description | Example |
|------|-------------|---------|
| `feat` | New feature | `feat: add multi-proxy config list` |
| `fix` | Bug fix | `fix: handle cors error when proxy unreachable` |
| `docs` | Documentation | `docs: update readme with pwa setup` |
| `style` | Code formatting (no logic change) | `style: format css variables alphabetically` |
| `refactor` | Refactoring (non-feature, non-fix) | `refactor: extract miner status logic to utils` |
| `perf` | Performance optimization | `perf: debounce resize handler` |
| `test` | Test related | `test: add unit tests for storage module` |
| `chore` | Build/tool/dependency updates | `chore: update github actions workflow` |

**PR Title Format:**
```
<type>(<scope>): <description>

# Examples
feat(ui): add skeleton loading for dashboard cards
fix(api): handle 401 response with auto logout
docs(readme): add troubleshooting section for cors
```

### PR Description Template

```markdown
## 📝 Change Summary

Briefly describe what this PR does and what problem it solves.

## 🔗 Related Issues

Closes #123 / Relates to #456

## 🧪 Testing Notes

- [ ] Local preview passes
- [ ] Real XMRig Proxy connection test passes
- [ ] Mobile responsive layout works
- [ ] Dark/light theme (if applicable) works
- [ ] No console errors

## 📸 Screenshots/Recording (if UI changes)

Before/after screenshots or interaction recordings.

## ⚠️ Breaking Changes

If any breaking changes, please detail them and provide migration guide.

## 📋 Review Focus

Files/logic you'd like reviewers to pay special attention to.
```

### PR Review Process

1. **Automated checks**: CI runs automatically (lint, type checks, etc. if configured)
2. **Code review**: At least 1 maintainer reviews, approval required for merge
3. **Conflict resolution**: Author resolves any conflicts
4. **Squash merge**: Maintainer uses Squash and merge to keep history clean

---

## 📏 Code Conventions

### General Principles

> See [CLAUDE.md](CLAUDE.md) "Development Principles" and "Code Conventions" sections (this file is in version control).

| Convention | Requirement |
|------------|-------------|
| **Modular** | All JS uses `export`/`import`, entry `main.js` is `<script type="module">` |
| **Async** | Unified `async/await`, errors handled via `try/catch` |
| **Naming** | `camelCase` variables/functions, `PascalCase` classes/constructors, `UPPER_SNAKE` constants |
| **Comments** | Public functions must have JSDoc; complex logic gets inline comments |
| **CSS** | Prefer CSS variables (`--*`), BEM naming, mobile-first responsive |
| **Security** | All dynamic content via `escapeHtml()`, no `innerHTML` with user data |
| **Logging** | `console.debug` for request URLs, **Token replaced with `**********`** |

### Core Module Responsibilities

| Module | Responsibility | Forbidden |
|--------|----------------|-----------|
| `api.js` | Unified request wrapper, auth, timeout (`AbortSignal.timeout` cancels fetch), error normalization (throws Error with status only), token masking | Direct `fetch`, business logic, **UI decisions (logout/toast handled by main.js)** |
| `storage.js` | Config storage abstraction, Remember Me logic, refresh interval persistence, theme storage, write permission caching | Direct `localStorage`/`sessionStorage` manipulation |
| `ui.js` | UI components, render utilities, formatting functions | Business logic, network requests |
| `main.js` | App entry, state machine, event binding, auto-refresh (configurable 1-120s), logout/error toast decisions | Direct DOM manipulation (delegate to ui.js) |

### New Code Must Follow

1. **All new network requests must go through `api.request()`**
2. **All new config read/write must go through `storage.*`**
3. **All new UI feedback should prefer `ui.showToast()` / `ui.renderSkeleton()`**
4. **Style changes prefer CSS variable adjustments, avoid hardcoded colors**
5. **No `npm` dependencies, build tools, TypeScript, frameworks — keep zero-build**

### Security Red Lines (Violation = Reject Merge)

- ❌ Any form of `eval()` / `new Function()` / `innerHTML` with user data
- ❌ Token in plaintext in `console.log` / `localStorage` key / URL params
- ❌ Removing or weakening CSP policy
- ❌ Introducing third-party CDN resources (unless security assessed with SRI)

---

## 💬 Commit Message Conventions

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Examples

```bash
# New feature
git commit -m "feat(api): add request timeout configuration option

Allow customizing the 8s default timeout via config.

Closes #42

Co-authored-by: cgsdn <chaogeshuodiannao@users.noreply.github.com>"

# Bug fix
git commit -m "fix(ui): prevent xss in miner name rendering

Escape miner name before inserting into DOM via textContent.

Co-authored-by: cgsdn <chaogeshuodiannao@users.noreply.github.com>"

# Documentation update
git commit -m "docs(contributing): add pr template and review checklist

Co-authored-by: cgsdn <chaogeshuodiannao@users.noreply.github.com>"
```

### Mandatory Requirements

- **Every commit MUST include** `Co-authored-by: cgsdn <chaogeshuodiannao@users.noreply.github.com>`
- Subject line ≤ 72 characters
- Use imperative mood ("add" not "added" or "adds")
- Body explains "why" not "what" (code shows what)

---

## 🌿 Branch Strategy

### Main Branch

- `main`: Production-ready code, protected branch, PR merge only

### Feature Branches

```
feat/<short-description>     # New feature
fix/<short-description>      # Bug fix
docs/<short-description>     # Documentation update
refactor/<short-description> # Refactoring
perf/<short-description>     # Performance optimization
test/<short-description>     # Test related
chore/<short-description>    # Maintenance tasks
```

### Branch Naming Examples

- `feat/multi-proxy-config`
- `fix/cors-error-handling`
- `docs/readme-faq-update`
- `refactor/api-error-normalization`
- `perf/debounce-resize-handler`

### Branch Lifecycle

1. Create feature branch from `main`
2. Local development, commit, self-test
3. Push to remote, create PR
4. Code review, iterate
5. Squash merge to `main`
6. Delete remote/local feature branch

---

## ✅ Code Review Checklist

### Reviewer Must-Check Items

| Category | Checkpoints |
|----------|-------------|
| **Security** | Token masking, XSS protection, CSP integrity, no sensitive data leaks |
| **Architecture** | Single module responsibility, no circular deps, zero-knowledge principle |
| **Functionality** | Requirements fully covered, edge cases handled, error paths friendly |
| **Code Quality** | Clear naming, complete comments, no dead code, no magic numbers |
| **Performance** | No unnecessary re-renders, proper debounce/throttle, resource loading optimized |
| **Compatibility** | Modern browser support, mobile responsive, no framework deps |
| **Documentation** | README/comments synced, JSDOC complete, CHANGELOG (if needed) |

### Author Self-Check (Before PR)

- [ ] `git diff` line-by-line review, confirm no debug code remains
- [ ] Full local functional test passes
- [ ] Mobile/desktop responsive works
- [ ] No console warnings/errors
- [ ] Token log masking verified
- [ ] Documentation synced

---

## 🧪 Testing Requirements

### Current Testing Strategy

This project currently has no automated test framework, relying on **manual testing** and **code review** for quality. Future additions may include:

- Unit tests: Vitest / Jest (for pure functions: `storage.js`, `ui.js` formatters)
- E2E tests: Playwright / Cypress (critical user flows)
- Visual regression: Chromatic / Percy (UI components)

### Manual Test Checklist (Required for Every PR)

| Scenario | Test Points |
|----------|-------------|
| First visit | Connect form shown, input validation, connect success/failure |
| Remember Me | `localStorage` persists, refresh page keeps login |
| Session only | `sessionStorage`, close tab clears config |
| Settings change | Modify URL/Token/Remember Me, logout |
| Auto-refresh | Configurable interval (1-120s, default 10s), manual refresh, network error retry |
| Error handling | 401 auto logout, network timeout, CORS error, Proxy offline |
| Responsive | 320px / 768px / 1024px / 1440px breakpoints |
| Security | Console token masking, CSP active, no XSS vulnerabilities |

---

## 🚢 Release Process

### Versioning

Follow [Semantic Versioning](https://semver.org/):

- `MAJOR`: Incompatible API changes (e.g., architecture rewrite, storage format change)
- `MINOR`: Backward-compatible new features
- `PATCH`: Backward-compatible bug fixes

### Release Steps

1. Update version number (if `package.json` or version file exists)
2. Update `CHANGELOG.md` (if exists)
3. Create release branch or tag directly on `main`
4. GitHub Actions auto-deploy to GitHub Pages (if configured)
5. Publish GitHub Release with changelog

---

## 📞 Getting Help

- **Issue discussion**: [GitHub Issues](https://github.com/wjc2821296948/XMRig-Proxy-Dashboard/issues)
- **Security vulnerabilities**: Report privately via GitHub Security Advisories, not public issues
- **General questions**: Ask in Issues or start a Discussion

---

## 📄 License

By contributing, you agree that your contributions will be licensed under [Apache License 2.0](LICENSE).

---

> This guide references multiple open-source project contribution standards, aiming to establish a clear, sustainable collaboration process for this project. Suggestions for improvement are welcome via Issue or PR.