# XMRig Proxy Dashboard

> **纯前端、零知识、静态部署** 的 XMRig Proxy 实时监控面板。

---

## ✨ 核心特性

| 特性 | 说明 |
|------|------|
| **实时监控** | 自动每 10 秒刷新一次，展示算力、矿工、上游矿池、系统资源等关键指标 |
| **零知识架构** | 服务器**仅提供静态文件**，**不知晓**用户连接的 Proxy 地址、Token、任何配置 |
| **本地认证** | Access Token 仅保存在浏览器 `localStorage` / `sessionStorage`，关闭浏览器即可清除 |
| **记住我** | 可选 `localStorage` 持久化，或 `sessionStorage` 仅会话保留 |
| **现代 UI** | 深色主题、响应式布局、Skeleton 加载、Toast 通知、Loading 动画 |
| **安全优先** | CSP、XSS 防护、Token 脱敏日志、无 `eval`/`innerHTML` 注入风险 |
| **无框架依赖** | 原生 ES Module，< 50 KB gzip，秒开 |

---

## 🚀 快速开始

### 1️⃣ 直接打开（无需服务器）
```bash
# 克隆仓库
git clone https://github.com/yourname/xmrig-proxy-dashboard.git
cd xmrig-proxy-dashboard

# 直接双击 index.html 用浏览器打开即可
# 或使用任意静态服务器
python3 -m http.server 8000
# 访问 http://localhost:8000
```

### 2️⃣ 静态托管部署（推荐）
支持任意静态托管平台，**无需任何后端配置**：

| 平台 | 部署方式 |
|------|----------|
| **GitHub Pages** | 推送到 `main` 分支 → Settings → Pages → Deploy from branch |
| **Cloudflare Pages** | 连接仓库 → Build command: 留空 / Output: `/` |
| **Netlify / Vercel** | 导入仓库 → 无需构建命令 → 直接部署 |
| **Nginx / Caddy / Apache** | 将文件夹作为静态站点根目录 |

> ✅ **零配置** —— 只要能服务静态文件即可。

---

## ⚙️ 配置 XMRig Proxy

在你的 `config.json` 中开启 HTTP API：

```json
{
  "http": {
    "enabled": true,
    "host": "0.0.0.0",
    "port": 8080,
    "access-token": "your-secure-token-here",
    "restricted": true
  }
}
```

- `access-token`：建议设置一个强随机字符串，面板将通过 `Authorization: Bearer <token>` 访问。
- `restricted: true`：仅允许 `/1/summary` 等只读端点，增强安全性。
- 防火墙仅需放行该端口，**无需对公网开放管理界面**。

---

## 🔐 使用流程

1. **首次访问** → 显示连接表单  
2. 填入 **API URL**（如 `http://192.168.1.100:8080/1/summary`）与 **Access Token**  
3. 可勾选 **记住我** → 使用 `localStorage` 持久化；不勾选 → `sessionStorage`，关闭标签页自动清除  
4. 点击 **连接** → 前端直连你的 Proxy，验证 Token  
5. 成功后进入 Dashboard，自动每 10 秒刷新  
6. 点击右上角 **⚙ 设置** → 修改 URL / Token / 记住我 / 登出

---

## 🏗️ 架构设计

```
┌─────────────┐       HTTPS (静态资源)        ┌─────────────┐
│   浏览器     │ ────────────────────────────▶ │  静态服务器  │
│  (前端应用)  │                                │  (GitHub    │
│             │                                │   Pages,    │
│  - index.html                     仅提供文件，无任何后端逻辑
│  - styles.css                     无数据库、无认证、无用户系统
│  - src/*.js                       Zero Knowledge
└──────┬──────┘
       │
       │  直接请求 (Authorization: Bearer <token>)
       ▼
┌─────────────────────┐
│   你的 XMRig Proxy  │
│   (http://ip:8080)  │
│   /1/summary 端点   │
└─────────────────────┘
```

### 关键点
- **服务器完全无感**：不存储、不代理、不记录任何用户数据
- **Token 仅存在浏览器**：`localStorage` / `sessionStorage`，关闭浏览器可自动清除
- **所有请求直连 Proxy**：绕过部署站点，避免 CORS、中间人风险
- **CSP + XSS 防护**：`Content-Security-Policy`、严格的 DOM 操作、Token 脱敏日志

---

## 📁 项目结构

```
xmrig-proxy-dashboard/
├── index.html          # 入口 HTML
├── styles.css          # 完整样式（CSS 变量、响应式、动画）
├── panel.png           # 预览图
├── README.md           # 本文档
├── CLAUDE.md           # 项目记忆（供 AI 协作参考）
├── .gitignore
└── src/
    ├── main.js         # 应用入口、状态机、事件绑定
    ├── api.js          # 统一 API 请求封装（鉴权、超时、错误归一化）
    ├── storage.js      # 配置存储抽象（localStorage / sessionStorage）
    └── ui.js           # UI 组件（Skeleton、Toast、渲染工具函数）
```

---

## 🛡️ 安全说明

| 威胁 | 防护措施 |
|------|----------|
| **Token 泄露** | 仅存在浏览器本地存储，控制台日志自动脱敏 `Bearer **********` |
| **XSS** | 无 `innerHTML` 注入用户数据，统一 `escapeHtml()`，CSP 禁止内联脚本执行 |
| **中间人攻击** | 建议 Proxy 开启 HTTPS（自签证书需浏览器信任）或通过 VPN/隧道访问 |
| **CSRF** | 纯 GET 请求 + Bearer Token，无 Cookie，天然免疫 CSRF |
| **配置注入** | URL 经 `new URL()` 校验，Token 仅作 Header 传输 |

---

## ❓ 常见问题 (FAQ)

**Q: 为什么不做后端代理？**  
A: 违背 Zero Knowledge 原则。后端一旦知晓 Proxy 地址/Token，即成为攻击面。纯前端直连最安全。

**Q: 遇到 CORS 报错怎么办？**  
A: XMRig Proxy 默认允许跨域。若被拦截，请在 Proxy 配置中确认 `restricted: true` 且 `access-token` 正确；或在同源域名下通过 Nginx 反代 `/1/summary`。

**Q: Token 忘了怎么找回？**  
A: 面板无法找回。请到 Proxy 服务器的 `config.json` 查看 `access-token` 字段。

**Q: 如何在公网部署面板又不暴露 Proxy？**  
A: 面板部署在公网（GitHub Pages 等），Proxy 部署在内网/云服务器，**仅面板所在浏览器** 直连 Proxy IP。面板服务器完全不知情。

**Q: 支持多个 Proxy 切换？**  
A: 当前版本单实例。可通过「设置」修改 URL/Token 实现切换；未来可扩展多配置列表。

---

## 🤝 贡献指南

1. Fork 本仓库
2. 创建特性分支：`git checkout -b feat/awesome-feature`
3. 提交变更：`git commit -m "feat: add awesome feature"`
4. 推送分支：`git push origin feat/awesome-feature`
5. 发起 Pull Request

> 提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/)。

---

## 📄 许可证

MIT License — 随意使用、修改、分发。

---

## 🙏 致谢

- [XMRig Proxy](https://github.com/xmrig/xmrig-proxy) — 高性能矿池代理
- 所有提交 Issue / PR 的贡献者

---

> **零知识、零后端、零负担** — 专为矿主设计的轻量监控面板。