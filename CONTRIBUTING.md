# 贡献指南 / Contributing Guide

感谢您对 XMRig Proxy Dashboard 的关注！欢迎任何形式的贡献，包括但不限于：

- 🐛 Bug 报告
- 💡 功能建议
- 📝 文档改进
- 🔧 代码贡献（修复、重构、新功能）
- 🧪 测试用例
- 🌐 翻译/本地化

---

## 📋 目录

1. [行为准则](#行为准则)
2. [如何开始](#如何开始)
3. [Issue 报告指南](#issue-报告指南)
4. [Pull Request 流程](#pull-request-流程)
5. [代码规范](#代码规范)
6. [提交信息规范](#提交信息规范)
7. [分支策略](#分支策略)
8. [代码审查清单](#代码审查清单)
9. [测试要求](#测试要求)
10. [发布流程](#发布流程)

---

## 🤝 行为准则

本项目遵循 [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/) 行为准则。参与即表示您同意遵守其条款。请尊重所有贡献者，保持友善、包容的交流环境。

---

## 🚀 如何开始

### 环境要求

- 现代浏览器（支持 ES Modules）
- 任意静态文件服务器（可选，用于本地预览）
- Git
- 代码编辑器（推荐 VS Code）

### 本地开发

```bash
# 1. Fork 仓库到您的 GitHub 账号
# 2. 克隆您的 Fork
git clone https://github.com/YOUR_USERNAME/XMRig-Proxy-Dashboard.git
cd XMRig-Proxy-Dashboard

# 3. 创建功能分支
git checkout -b feat/your-feature-name
# 或修复分支
git checkout -b fix/your-fix-name

# 4. 启动本地预览（任选其一）
# Python 3
python3 -m http.server 8000
# Node.js (npx serve)
npx serve .
# VS Code Live Server 扩展
# 直接双击 index.html 也可（但受 CORS 限制，API 请求可能失败）

# 5. 在浏览器访问 http://localhost:8000
```

### 项目结构速览

```
xmrig-proxy-dashboard/
├── index.html          # 入口 HTML
├── styles.css          # 完整样式（CSS 变量、响应式、动画）
├── CONTRIBUTING.md     # 本文件
├── README.md           # 中文文档
├── README.en.md        # 英文文档
├── CLAUDE.md           # 项目记忆（供 AI 协作参考）
├── .gitignore
└── src/
    ├── main.js         # 应用入口、状态机、事件绑定
    ├── api.js          # 统一 API 请求封装（鉴权、超时、错误归一化）
    ├── storage.js      # 配置存储抽象（localStorage / sessionStorage）
    └── ui.js           # UI 组件（Skeleton、Toast、渲染工具函数）
```

---

## 🐛 Issue 报告指南

### 搜索现有 Issue

在创建新 Issue 前，请先搜索 [Issues 列表](https://github.com/wjc2821296948/XMRig-Proxy-Dashboard/issues) 确认是否已有相同或类似的报告。

### Bug 报告模板

创建 Bug 报告时，请包含以下信息：

```markdown
## 🐛 Bug 描述

清晰简洁地描述问题是什么。

## 🔄 复现步骤

1. 打开 '...'
2. 点击 '....'
3. 滚动到 '....'
4. 看到错误

## ✅ 期望行为

描述您期望发生的行为。

## 📱 环境信息

- 操作系统: [如 Windows 11, macOS 14, Ubuntu 22.04]
- 浏览器: [如 Chrome 120, Firefox 121, Safari 17]
- XMRig Proxy 版本: [如 6.21.0]
- 面板部署方式: [如 GitHub Pages, 本地文件, Nginx]

## 📷 截图/录屏

如果适用，添加截图或录屏帮助解释问题。

## 📋 补充信息

其他任何配置、日志、网络请求截图等有助于定位问题的信息。
```

### 功能建议模板

```markdown
## 💡 功能建议

### 问题背景

描述这个功能要解决什么问题，或改善什么体验。

### 建议方案

清晰描述您希望的实现方式。

### 替代方案

您考虑过的其他实现方式（如有）。

### 优先级

- [ ] 高 - 核心功能缺失/严重体验问题
- [ ] 中 - 重要改进/常用场景优化
- [ ] 低 - 锦上添花/小众需求

### 相关 Issue/PR

关联的 Issue 编号或 PR 链接（如有）。
```

---

## 🔄 Pull Request 流程

### PR 创建前检查清单

- [ ] 代码通过 ESLint/Prettier 检查（如有配置）
- [ ] 无 `console.log`/`console.debug` 残留（调试代码已清理）
- [ ] Token 相关日志已脱敏（`Bearer **********`）
- [ ] 所有动态内容经 `escapeHtml()` 处理
- [ ] 新增功能有对应的文档更新（README/注释）
- [ ] 无破坏性变更，或已在 PR 描述中说明迁移路径
- [ ] 自测通过：本地预览正常、连接真实 Proxy 测试通过

### PR 标题规范

遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

| 类型 | 说明 | 示例 |
|------|------|------|
| `feat` | 新功能 | `feat: add multi-proxy config list` |
| `fix` | Bug 修复 | `fix: handle cors error when proxy unreachable` |
| `docs` | 文档更新 | `docs: update readme with pwa setup` |
| `style` | 代码格式（不影响逻辑） | `style: format css variables alphabetically` |
| `refactor` | 重构（非新功能、非修复） | `refactor: extract miner status logic to utils` |
| `perf` | 性能优化 | `perf: debounce resize handler` |
| `test` | 测试相关 | `test: add unit tests for storage module` |
| `chore` | 构建/工具/依赖更新 | `chore: update github actions workflow` |

**PR 标题格式：**
```
<type>(<scope>): <description>

# 示例
feat(ui): add skeleton loading for dashboard cards
fix(api): handle 401 response with auto logout
docs(readme): add troubleshooting section for cors
```

### PR 描述模板

```markdown
## 📝 变更摘要

简述本 PR 做了什么，解决什么问题。

## 🔗 关联 Issue

Closes #123 / Relates to #456

## 🧪 测试说明

- [ ] 本地预览通过
- [ ] 连接真实 XMRig Proxy 测试通过
- [ ] 移动端响应式布局正常
- [ ] 暗/亮主题（如涉及）正常
- [ ] 无控制台报错

## 📸 截图/录屏（如涉及 UI 变更）

前后对比截图或交互录屏。

## ⚠️ 破坏性变更

如有破坏性变更，请详细说明及迁移指引。

## 📋 审查重点

希望 Reviewer 重点关注的文件/逻辑。
```

### PR 审查流程

1. **自动检查**：CI 自动运行（Lint、类型检查等，如有配置）
2. **代码审查**：至少 1 位维护者 Review，通过后可合并
3. **解决冲突**：如有冲突，由作者解决
4. **Squash 合并**：维护者使用 Squash and merge，保持历史整洁

---

## 📏 代码规范

### 通用原则

> 详见 [CLAUDE.md](CLAUDE.md) 中的「开发原则」与「代码规范」章节（该文件已纳入版本控制）。

| 规范 | 要求 |
|------|------|
| **模块化** | 所有 JS 使用 `export`/`import`，入口 `main.js` 为 `<script type="module">` |
| **异步** | 统一 `async/await`，错误通过 `try/catch` 统一处理 |
| **命名** | `camelCase` 变量/函数，`PascalCase` 类/构造器，`UPPER_SNAKE` 常量 |
| **注释** | 公共函数必须有 JSDoc；复杂逻辑加单行注释 |
| **CSS** | 优先使用 CSS 变量（`--*`），BEM 命名，移动优先响应式 |
| **安全** | 动态内容统一 `escapeHtml()`，禁止 `innerHTML` 拼接用户数据 |
| **日志** | `console.debug` 记录请求 URL，**Token 替换为 `**********`** |

### 核心模块职责

| 模块 | 职责 | 禁止事项 |
|------|------|----------|
| `api.js` | 统一请求封装、鉴权、超时（`AbortSignal.timeout` 取消底层 fetch）、错误归一化（仅抛出带 status 的 Error）、Token 脱敏日志 | 直接 `fetch`、业务逻辑、**UI 决策（登出/toast 由 main.js 负责）** |
| `storage.js` | 配置存储抽象、Remember Me 逻辑、刷新间隔持久化、主题存储、写权限缓存 | 直接操作 `localStorage`/`sessionStorage` |
| `ui.js` | UI 组件、渲染工具函数、格式化函数 | 业务逻辑、网络请求 |
| `main.js` | 应用入口、状态机、事件绑定、自动刷新（可配置 1-120 秒）、登出/错误 toast 决策 | 直接 DOM 操作（应委托给 ui.js） |

### 新增代码必须遵守

1. **任何新增网络请求（`api.js` 外部）必须走 `api.request()`**
2. **任何新增配置读写必须走 `storage.*`**
3. **任何新增 UI 反馈优先用 `ui.showToast()` / `ui.renderSkeleton()`**
4. **修改样式优先调整 CSS 变量，避免硬编码颜色**
5. **不要引入 `npm` 依赖、打包工具、TypeScript、框架——保持零构建**

### 安全红线（违者拒绝合并）

- ❌ 任何形式的 `eval()` / `new Function()` / `innerHTML` 拼接用户数据
- ❌ Token 以明文形式出现在 `console.log` / `localStorage` key / URL 参数中
- ❌ 移除或削弱 CSP 策略
- ❌ 引入第三方 CDN 资源（除非经安全评估且通过 SRI 校验）

---

## 💬 提交信息规范

遵循 [Conventional Commits](https://www.conventionalcommits.org/)：

```
<type>(<scope>): <subject>

<body>

<footer>
```

### 示例

```bash
# 功能新增
git commit -m "feat(api): add request timeout configuration option

Allow customizing the 8s default timeout via config.

Closes #42

Co-authored-by: cgsdn <chaogeshuodiannao@users.noreply.github.com>"

# Bug 修复
git commit -m "fix(ui): prevent xss in miner name rendering

Escape miner name before inserting into DOM via textContent.

Co-authored-by: cgsdn <chaogeshuodiannao@users.noreply.github.com>"

# 文档更新
git commit -m "docs(contributing): add pr template and review checklist

Co-authored-by: cgsdn <chaogeshuodiannao@users.noreply.github.com>"
```

### 强制要求

- **每次提交必须包含** `Co-authored-by: cgsdn <chaogeshuodiannao@users.noreply.github.com>`
- Subject 行不超过 72 字符
- 使用祈使语气（"add" 而非 "added"、"adds"）
- Body 解释"为什么"而非"做了什么"（代码已说明做了什么）

---

## 🌿 分支策略

### 主分支

- `main`：生产就绪代码，受保护分支，仅允许 PR 合并

### 功能分支

```
feat/<short-description>     # 新功能
fix/<short-description>      # Bug 修复
docs/<short-description>     # 文档更新
refactor/<short-description> # 重构
perf/<short-description>     # 性能优化
test/<short-description>     # 测试相关
chore/<short-description>    # 维护任务
```

### 分支命名示例

- `feat/multi-proxy-config`
- `fix/cors-error-handling`
- `docs/readme-faq-update`
- `refactor/api-error-normalization`
- `perf/debounce-resize-handler`

### 分支生命周期

1. 从 `main` 创建功能分支
2. 本地开发、提交、自测
3. 推送到远程，创建 PR
4. 代码审查、修改
5. Squash 合并到 `main`
6. 删除远程/本地功能分支

---

## ✅ 代码审查清单

### Reviewer 必查项

| 类别 | 检查点 |
|------|--------|
| **安全** | Token 脱敏、XSS 防护、CSP 完整性、无敏感信息泄露 |
| **架构** | 模块职责单一、无循环依赖、符合零知识原则 |
| **功能** | 需求覆盖完整、边界情况处理、错误路径友好 |
| **代码质量** | 命名清晰、注释完整、无死代码、无魔法数字 |
| **性能** | 无不必要的重渲染、防抖/节流合理、资源加载优化 |
| **兼容性** | 现代浏览器支持、移动端响应式、无框架依赖 |
| **文档** | README/注释同步更新、JSDOC 完整、CHANGELOG（如需） |

### 作者自查项（提交 PR 前）

- [ ] `git diff` 逐行检查，确认无调试代码残留
- [ ] 本地完整功能测试通过
- [ ] 移动端/桌面端响应式正常
- [ ] 控制台无报警/错误
- [ ] Token 日志脱敏验证
- [ ] 文档同步更新

---

## 🧪 测试要求

### 当前测试策略

本项目暂无自动化测试框架，依赖**人工测试**与**代码审查**保证质量。未来可引入：

- 单元测试：Vitest / Jest（针对纯函数：`storage.js`、`ui.js` 格式化函数）
- E2E 测试：Playwright / Cypress（关键用户流程）
- 视觉回归：Chromatic / Percy（UI 组件）

### 手动测试清单（每次 PR 必跑）

| 场景 | 测试要点 |
|------|----------|
| 首次访问 | 连接表单显示、输入验证、连接成功/失败 |
| 记住我 | `localStorage` 持久化、刷新页面保持登录 |
| 仅会话 | `sessionStorage`、关闭标签页清除配置 |
| 设置修改 | 修改 URL/Token/Remember Me、登出 |
| 自动刷新 | 可配置间隔 (1-120s，默认 10s)、网络异常重试 |
| 错误处理 | 401 自动登出、网络超时、CORS 错误、Proxy 离线 |
| 响应式 | 320px / 768px / 1024px / 1440px 断点 |
| 安全 | 控制台 Token 脱敏、CSP 生效、无 XSS 漏洞 |

---

## 🚢 发布流程

### 版本规范

遵循 [Semantic Versioning](https://semver.org/)：

- `MAJOR`：不兼容的 API 变更（如架构重构、存储格式变更）
- `MINOR`：向后兼容的功能新增
- `PATCH`：向后兼容的 Bug 修复

### 发布步骤

1. 更新版本号（如有 `package.json` 或版本文件）
2. 更新 `CHANGELOG.md`（如有）
3. 创建 Release 分支或直接在 `main` 打 Tag
4. GitHub Actions 自动部署到 GitHub Pages（如配置）
5. 发布 GitHub Release，附上变更日志

---

## 📞 获取帮助

- **Issue 讨论**：[GitHub Issues](https://github.com/wjc2821296948/XMRig-Proxy-Dashboard/issues)
- **安全漏洞**：请通过 GitHub Security Advisories 私密报告，勿公开 Issue
- **一般咨询**：可在 Issue 中提问或发起 Discussion

---

## 📄 许可证

贡献即表示您同意您的贡献将在 [Apache License 2.0](LICENSE) 下授权。

---

> 本指南参考了多个开源项目的贡献规范，旨在为项目建立清晰、可持续的协作流程。如有改进建议，欢迎提 Issue 或 PR 完善本文件。