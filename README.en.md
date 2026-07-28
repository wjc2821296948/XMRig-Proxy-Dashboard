# XMRig Proxy Dashboard

> **Pure frontend, zero-knowledge, static deployment** real-time monitoring panel for XMRig Proxy.

🔗 **Live Preview**: <https://xmrig-proxy-dashboard.lrate.top/>

[English](README.en.md) | [中文](README.md)

---

## ✨ Core Features

| Feature | Description |
|---------|-------------|
| **Real-time Monitoring** | Auto-refreshes every 10 seconds, showing hashrate, miners, upstream pools, system resources |
| **Zero-Knowledge Architecture** | Server **only serves static files**, **knows nothing** about your Proxy address, Token, or any config |
| **Local Auth** | Access Token stored only in browser `localStorage` / `sessionStorage`, cleared on browser close |
| **Remember Me** | Optional `localStorage` persistence, or `sessionStorage` for session-only |
| **Modern UI** | Dark theme, responsive layout, Skeleton loading, Toast notifications, Loading animations |
| **Security First** | CSP, XSS protection, Token sanitized logs, no `eval`/`innerHTML` injection risks |
| **No Framework Deps** | Native ES Modules, < 50 KB gzip, instant load |

---

## 🚀 Quick Start

### 1️⃣ Open Directly (No Server Needed)

```bash
# Clone repository
git clone https://github.com/yourname/xmrig-proxy-dashboard.git
cd xmrig-proxy-dashboard

# Open index.html directly in browser
# Or use any static server
python3 -m http.server 8000
# Visit http://localhost:8000
```

### 2️⃣ Static Hosting Deployment (Recommended)

Deploy to any static hosting platform, **no backend config needed**:

| Platform | Deploy Method |
|----------|---------------|
| **GitHub Pages** | Push to `main` branch → Settings → Pages → Deploy from branch |
| **Cloudflare Pages** | Connect repo → Build command: empty / Output: `/` |
| **Netlify / Vercel** | Import repo → No build command → Direct deploy |
| **Nginx / Caddy / Apache** | Serve folder as static site root |

> ✅ **Zero Config** — just serve static files.

---

## ⚙️ Configure XMRig Proxy

Enable HTTP API in your `config.json`:

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

- `access-token`: Use a strong random string. Panel authenticates via `Authorization: Bearer <token>`.
- `restricted: true`: Allows only `/1/summary` and other read-only endpoints, enhancing security.
- Firewall only needs to allow this port, **no need to expose admin UI to public internet**.

---

## 🔐 Usage Flow

1. **First Visit** → Connection form displayed
2. Enter **API URL** (e.g. `http://192.168.1.100:8080/1/summary`) and **Access Token**
3. Check **Remember Me** → uses `localStorage` (persistent); unchecked → `sessionStorage` (cleared on tab close)
4. Click **Connect** → Frontend connects directly to your Proxy, validates Token
5. Success → Dashboard loads, auto-refreshes every 10 seconds
6. Click **⚙ Settings** (top-right) → Change URL / Token / Remember Me / Logout

---

## 🏗️ Architecture Design

```
┌─────────────┐       HTTPS (Static Assets)        ┌─────────────┐
│   Browser   │ ─────────────────────────────────▶ │ Static Server │
│  (Frontend) │                                     │ (GitHub     │
│             │                                     │  Pages,     │
│  - index.html                    Serves files only, no backend logic
│  - styles.css                    No database, no auth, no user system
│  - src/*.js                      Zero Knowledge
└──────┬──────┘
       │
       │  Direct Request (Authorization: Bearer <token>)
       ▼
┌─────────────────────┐
│   Your XMRig Proxy  │
│   (http://ip:8080)  │
│   /1/summary endpoint│
└─────────────────────┘
```

### Key Points

- **Server is completely unaware**: No storage, no proxying, no logging of user data
- **Token stays in browser only**: `localStorage` / `sessionStorage`, auto-cleared on browser close
- **All requests connect directly to Proxy**: Bypasses deployment site, avoids CORS, MITM risks
- **CSP + XSS Protection**: `Content-Security-Policy`, strict DOM operations, Token sanitized logs

---

## 📁 Project Structure

```
xmrig-proxy-dashboard/
├── index.html          # Entry HTML
├── styles.css          # Complete styles (CSS vars, responsive, animations)
├── panel.png           # Preview image
├── README.md           # Chinese version
├── README.en.md        # English version (this file)
├── CLAUDE.md           # Project memory (for AI collaboration)
├── .gitignore
└── src/
    ├── main.js         # App entry, state machine, event bindings
    ├── api.js          # Unified API wrapper (auth, timeout, error normalization)
    ├── storage.js      # Config storage abstraction (localStorage / sessionStorage)
    └── ui.js           # UI components (Skeleton, Toast, render utilities)
```

---

## 🛡️ Security

| Threat | Mitigation |
|--------|------------|
| **Token Leak** | Stored only in browser local storage, console logs sanitized `Bearer **********` |
| **XSS** | No `innerHTML` injection of user data, unified `escapeHtml()`, CSP blocks inline scripts |
| **MITM** | Recommend Proxy enables HTTPS (self-signed needs browser trust) or access via VPN/tunnel |
| **CSRF** | Pure GET + Bearer Token, no Cookies, naturally immune to CSRF |
| **Config Injection** | URL validated via `new URL()`, Token only sent as Header |

---

## ❓ FAQ

**Q: Why no backend proxy?**  
A: Violates Zero Knowledge principle. Once backend knows Proxy address/Token, it becomes an attack surface. Pure frontend direct connect is most secure.

**Q: CORS errors?**  
A: XMRig Proxy allows CORS by default. If blocked, verify `restricted: true` and `access-token` are correct in Proxy config; or reverse proxy `/1/summary` via Nginx on same origin.

**Q: Forgot Token?**  
A: Panel cannot recover it. Check `config.json` on your Proxy server for `access-token`.

**Q: Deploy panel publicly without exposing Proxy?**  
A: Panel on public (GitHub Pages, etc.), Proxy on internal network/cloud server. **Only the browser running the panel** connects directly to Proxy IP. Panel server knows nothing.

**Q: Multiple Proxy switching?**  
A: Current version single instance. Switch via "Settings" to change URL/Token; future versions may support multi-config list.

---

## 🏗️ Key Design Decisions (Post-Refactor)

| Decision | Context | Impact |
|----------|---------|--------|
| **ES Module instead of single script.js** | Modularity, tree-shaking, native browser support | No build tools needed, zero deps maintained |
| **Unified `api.js` fetch wrapper** | Original code had scattered `fetch` calls, hard to unify auth/error handling | Single point control for auth, timeout, sanitized logs |
| **Storage abstraction `storage.js`** | Original code used `localStorage` directly, no Remember Me support | Unified Remember Me logic, easy to test/replace |
| **UI componentization `ui.js`** | Original `renderDashboard` was 200+ lines of string concatenation | Separation of concerns, Skeleton/Toast reuse |
| **CSP + escapeHtml** | Original code used heavy `innerHTML` template strings, XSS risk | Eliminates DOM XSS risk, meets security baseline |
| **Token sanitized logs** | Original `console.log` printed full Token | Prevents console leaks, passes security audits |
| **Responsive CSS variable theme** | Original CSS hardcoded colors, hard to extend themes | Supports future dark/light toggle, improved maintainability |

---

## 📋 Deployment Checklist

- [ ] Static hosting platform configured with **HTTPS**
- [ ] `Content-Security-Policy` active (see `index.html` meta tag)
- [ ] No `console.log` leaking Token (all sanitized)
- [ ] `index.html` references `<script type="module" src="src/main.js">`
- [ ] No build step, push to deploy

---

## 📋 Roadmap

- [ ] **Multi-Proxy Config List** — Save multiple Proxy configs, switch with one click
- [ ] **PWA Support** — Offline cache last data, "Add to Home Screen"
- [ ] **Theme Toggle** — Dark/Light theme switching, CSS variables ready
- [ ] **More Chart Libraries** — Optional historical trends (Chart.js / uPlot, lazy-loaded)
- [ ] **Optional Backend Proxy Mode** — Users may deploy stateless forwarder on own server, only forwards `/1/summary`, no logs, no Token storage
- [ ] **Alert/Notification System** — Hashrate anomalies, miner offline thresholds (browser notifications / Webhook)
- [ ] **Multi-language Support** — i18n framework reserved, Chinese/English priority

---

## 🤝 Contributing

1. Fork this repository
2. Create feature branch: `git checkout -b feat/xxx`
3. Commit changes: `git commit -m "feat: xxx"`
4. Push branch: `git push origin feat/xxx`
5. Open Pull Request

---

## 📄 License

Apache License 2.0 © 2025