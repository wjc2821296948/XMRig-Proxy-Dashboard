# XMRig Proxy Dashboard

> **纯前端、零知识、静态部署** 的 XMRig Proxy 实时监控面板。

🔗 **开放预览网站**：<https://xmrig-proxy-dashboard.lrate.top/>

[English](README.en.md) | [中文](README.md)

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

## 📋 下一步计划

- [ ] **多 Proxy 配置列表** —— 支持保存多组 Proxy 配置，一键切换
- [ ] **PWA 支持** —— 离线缓存最近一次数据，支持"添加到主屏幕"
- [ ] **主题切换** —— 暗/亮主题切换，CSS 变量已就绪
- [ ] **更多图表库集成** —— 可选的历史趋势图表（Chart.js / uPlot 等按需加载）
- [ ] **可选服务端代理模式** —— 用户自愿在自己的服务器部署无状态转发层，仅转发 `/1/summary`，不记录日志、不存 Token
- [ ] **告警/通知机制** —— 算力异常、矿工离线等阈值告警（本地浏览器通知 / Webhook）
- [ ] **多语言支持** —— i18n 框架预留，中英双语优先

---

## 🩺 状态判断与生产环境类比

Dashboard 顶部徽章的「离线 / 预警 / 在线」由 `src/ui.js` 中的
`getStatusInfo(data.miners)` 决定，规则如下：

| 显示 | 触发条件 | 生产环境真实含义（推断） |
|------|----------|--------------------------|
| **离线**（红） | `data.miners.now === 0` | 当前没有任何矿工连接此 proxy。可能是：所有矿工断电 / proxy 刚启动尚未有矿工接入 / 所有 Stratum 连接超时被踢 / 矿工们集体切到了备用 proxy |
| **预警**（黄） | `0 < now < max × 0.5` | 当前活跃矿工数低于历史峰值的一半。可能是：高峰期后矿工陆续收工 / 一批矿工掉线尚未重连 / 矿池抽风导致 failover 切换 / 矿工配置变更后还没全部回来 |
| **在线**（绿） | `now >= max × 0.5` | 大部分历史矿工仍稳定连接中 |

### 已知生产陷阱

1. **`max` 是历史最大值，不会归零**。重启 proxy 后 `max` 重新累计，但旧峰值会保留很久；若 `max = 1000` 而 `now = 10`，会被判为「预警」而非「离线」。
2. **`now` 是瞬时值**。矿池抽风 5 秒时，UI 会出现「离线 → 在线」闪烁。判断不依赖滑动平均。
3. **不感知健康度**。一个矿工拒了 99% 的 share 但仍在连，依然算「在线」。建议同时观察「挖矿结果」卡片中的「接受率」与「延迟」。
4. **proxy 重启瞬态**。`/1/summary` 返回 `miners.now = 0` 会被立刻判为「离线」，但实际上只是 proxy 自己重启了——矿工马上会重连回来。
5. **冷启动误报**。刚部署 proxy 时 `max = 0, now = 0`，触发「在线」（因为 `0 < 0 × 0.5` 为假），反而亮绿灯，容易误导。

### 与 Ribbon 状态的区别

Dashboard 同时维护两套并行的状态指示，请勿混淆：

| 元素 | 含义 | 控制函数 |
|------|------|----------|
| Header Ribbon（圆点 + 「只读视图」） | **登录态**：有没有成功连到 proxy | `setRibbonConnectState("connected" \| "disconnected")` |
| 状态徽章（圆点 + 「离线/预警/在线」） | **业务态**：矿工数多不多 | `getStatusInfo(data.miners)` |

Ribbon 绿色 = 上次 `/1/summary` 拿到 2xx；Ribbon 黄色 = 未登录 / 401 / 断开。
徽章颜色仅在成功获取 `/1/summary` 之后才有意义——若 Ribbon 处于黄色，徽章文字不会更新。

## 📄 许可证

Apache License 2.0 © 2025
