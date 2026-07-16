# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## 项目定位 / Project Positioning

**XMRig Proxy Dashboard** 是一个**纯前端、零知识、静态部署**的监控面板。

### 为什么采用纯前端 + 静态部署？

| 原因 | 说明 |
|------|------|
| **Zero Knowledge** | 服务器不知晓用户连接的 Proxy 地址、Access Token、任何配置。服务器仅分发 HTML/CSS/JS。 |
| **无后端、无数据库、无用户系统** | 消除服务端攻击面：无认证绕过、无 SQL 注入、无会话劫持、无数据泄露。 |
| **浏览器本地存储** | `localStorage`（记住我）或 `sessionStorage`（仅会话）保存 `API_URL` 与 `API_TOKEN`。关闭浏览器可自动清除。 |
| **Token 永不上传服务器** | 所有 API 请求由浏览器**直连**用户自建的 XMRig Proxy（`Authorization: Bearer <token>`），绕过部署站点。 |
| **最小信任边界** | 信任链：用户 ↔ 浏览器 ↔ 用户自己的 Proxy。部署站点完全不在信任链内。 |

### 放弃的方案及理由

| 方案 | 放弃理由 |
|------|----------|
| 服务端 `.env` 存储 Token | 服务端知晓凭证，违背 Zero Knowledge |
| 用户登录/注册系统 | 引入账号体系、数据库、密码管理，增加攻击面 |
| Python/Node.js/PHP 后端代理 | 中间人风险、维护成本、部署复杂度 |
| Vue/React/Angular 等重框架 | 体积大、构建链复杂、偏离“轻量静态”初衷 |

### 当前方案的优势与局限性

**优势**
- 极简部署：任意静态托管即可（GitHub Pages、Cloudflare Pages、Nginx 等）
- 零运维：无数据库、无迁移、无备份、无安全补丁
- 彻底隐私：凭证永不离开用户浏览器
- 跨平台：浏览器即运行环境

**局限性**
- 受浏览器同源策略限制，Proxy 需正确配置 CORS 或同域反代
- 无法在服务端聚合多用户数据、告警、历史趋势
- 依赖用户自行管理 Proxy 的 HTTPS/网络可达性

### 后续可选扩展方向（默认仍坚持纯静态架构）

- 可选的**服务端代理模式**：用户自愿在自己的服务器部署无状态转发层，仅转发 `/1/summary`，不记录日志、不存 Token
- 主题切换、更多图表库
- 多 Proxy 配置列表、一键切换
- PWA 支持、离线缓存最近一次数据

---

## 项目架构 / Architecture

```
浏览器
    │
    ▼
┌─────────────────────────────────────┐
│  index.html (入口)                   │
│  styles.css (全量样式，CSS 变量主题)   │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  src/ (ES Modules)                   │
│  ├── main.js     应用入口、状态机、   │
│  │               事件绑定、自动刷新   │
│  ├── api.js      统一请求封装         │
│  │               - 自动注入 Bearer    │
│  │               - 超时/错误归一化    │
│  │               - Token 脱敏日志      │
│  ├── storage.js  配置存储抽象         │
│  │               - localStorage       │
│  │               - sessionStorage     │
│  │               - Remember Me 切换   │
│  └── ui.js       UI 组件库            │
│                  - Skeleton Loading   │
│                  - Toast 通知         │
│                  - 渲染工具函数        │
└──────────────┬──────────────────────┘
               │
               ▼ 直连 (Authorization: Bearer <token>)
┌─────────────────────────────────────┐
│  用户自建 XMRig Proxy                │
│  GET /1/summary                      │
└─────────────────────────────────────┘
```

> **关键点**：服务器（GitHub Pages / Cloudflare Pages / Nginx 等）**仅提供静态文件**，不参与任何 API 请求转发、认证、存储。

---

## 开发原则 / Development Principles

所有未来开发必须遵守：

1. **保持纯静态部署** — 不新增任何后端服务、数据库、认证服务
2. **不引入大型前端框架** — 继续使用原生 ES Module + CSS Variables
3. **最大程度复用现有代码** — 重构优于重写
4. **不改变 Dashboard 核心交互** — 10s 自动刷新、指标含义、卡片布局
5. **安全优先** — Token 脱敏、CSP、XSS 防护、无 `eval`/`innerHTML` 注入
6. **Token 永远只在浏览器本地** — 绝不上传、绝不写入服务端日志
7. **保持模块化** — `api.js` / `storage.js` / `ui.js` / `main.js` 职责单一
8. **代码可维护、可扩展** — 命名清晰、注释完整、类型友好（JSDoc）

---

## 代码规范 / Code Conventions

| 规范 | 说明 |
|------|------|
| **模块化** | 所有 JS 使用 `export`/`import`，入口 `main.js` 为 `<script type="module">` |
| **异步** | 统一 `async/await`，错误通过 `try/catch` 统一处理 |
| **命名** | `camelCase` 变量/函数，`PascalCase` 类/构造器，`UPPER_SNAKE` 常量 |
| **注释** | 公共函数必须有 JSDoc；复杂逻辑加单行注释 |
| **CSS** | 优先使用 CSS 变量（`--*`），BEM 命名，移动优先响应式 |
| **安全** | 动态内容统一 `escapeHtml()`，禁止 `innerHTML` 拼接用户数据 |
| **日志** | `console.debug` 记录请求 URL，**Token 替换为 `**********`** |

---

## 关键模块说明 / Key Modules

### `src/api.js`
```js
// 统一请求入口
export async function request(path, options = {}) {
  // 1. 读取配置 (storage.getConfig())
  // 2. 拼接 URL, 注入 Authorization: Bearer <token>
  // 3. 8s 超时 Promise.race(fetch, timeout)
  // 4. 统一错误归一化: 401/403 → 触发登出; 其它 → Toast
  // 5. 返回 JSON
}
```
- **单一职责**：所有网络请求只走这里，便于审计、测试、替换。

### `src/storage.js`
```js
export function saveConfig({apiUrl, apiToken, remember})
export function loadConfig()   // 优先 localStorage → sessionStorage
export function clearConfig()
export function getConfig()    // 响应式获取最新配置
```
- **Remember Me** 逻辑封装于此，其它模块无感知。

### `src/ui.js`
- `showToast(msg, type, duration)` — 非阻塞通知
- `renderSkeleton(container, count)` — 首屏占位动画
- `formatHashrate/formatBytes/formatUptime/formatNumber` — 纯函数，易测试
- `getStatusInfo(miners)` — 状态分级逻辑复用

### `src/main.js`
- **状态机**：`init → loadConfig → (config? fetchAndRender : renderConnectForm)`
- **自动刷新**：`setInterval(fetchAndRender, 10000)`，可随时 `stopAutoRefresh()`
- **事件绑定**：设置按钮、连接表单、登出、模态框关闭
- **XSS 防护**：所有动态文本经 `escapeHtml()`，模态框用 `textContent` 填充

---

## 部署清单 / Deployment Checklist

- [ ] 静态托管平台已配置 **HTTPS**
- [ ] `Content-Security-Policy` 已生效（见 `index.html` meta 标签）
- [ ] 无 `console.log` 残留 Token（已全部脱敏）
- [ ] `index.html` 引用 `<script type="module" src="src/main.js">`
- [ ] 无构建步骤，直接推送即部署

---

## 本次重构的重要设计决策记录

| 决策 | 背景 | 影响 |
|------|------|------|
| **ES Module 替代单文件 script.js** | 便于模块化、Tree-shaking、浏览器原生支持 | 无需构建工具，保持零依赖 |
| **统一 `api.js` 封装 fetch** | 原代码分散在多处 `fetch`，难以统一鉴权、错误处理 | 单点控制鉴权、超时、脱敏日志 |
| **存储抽象 `storage.js`** | 原代码直接操作 `localStorage`，无 Remember Me 支持 | 统一 Remember Me 逻辑，便于测试替换 |
| **UI 组件化 `ui.js`** | 原代码 `renderDashboard` 超 200 行字符串拼接 | 关注点分离，Skeleton/Toast 复用 |
| **CSP + escapeHtml** | 原代码大量 `innerHTML` 模板字符串，存在 XSS 隐患 | 消除 DOM XSS 风险，符合安全基线 |
| **Token 脱敏日志** | 原代码 `console.log` 直接打印完整 Token | 杜绝控制台泄露，满足安全审计 |
| **响应式 CSS 变量主题** | 原 CSS 硬编码颜色，难以扩展主题 | 支持未来暗/亮主题切换，维护性提升 |

---

## 给未来 Claude Code 的提示

- **阅读 `src/` 下四个模块**即可掌握全貌，无需看旧 `script.js`（已废弃）。
- 任何新增网络请求**必须**走 `api.request()`。
- 任何新增配置读写**必须**走 `storage.*`。
- 任何新增 UI 反馈**优先**用 `ui.showToast()` / `ui.renderSkeleton()`。
- 修改样式**优先**调整 CSS 变量，避免硬编码颜色。
- **不要**引入 `npm` 依赖、打包工具、TypeScript、框架——保持零构建。

---

*此文件作为项目长期记忆，请在每次重大架构变更后同步更新。*