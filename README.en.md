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

## 📋 Roadmap

- [ ] **Multi-Proxy Config List** — Save multiple Proxy configs, switch with one click
- [ ] **PWA Support** — Offline cache last data, "Add to Home Screen"
- [ ] **Theme Toggle** — Dark/Light theme switching, CSS variables ready
- [ ] **More Chart Libraries** — Optional historical trends (Chart.js / uPlot, lazy-loaded)
- [ ] **Optional Backend Proxy Mode** — Users may deploy stateless forwarder on own server, only forwards `/1/summary`, no logs, no Token storage
- [ ] **Alert/Notification System** — Hashrate anomalies, miner offline thresholds (browser notifications / Webhook)
- [ ] **Multi-language Support** — i18n framework reserved, Chinese/English priority

---

## 🩺 Status Mapping & Production Semantics

The "Offline / Warning / Online" badge in the dashboard header is
computed by `getStatusInfo(data.miners)` in `src/ui.js`. The rules:

| Display | Trigger | Real-world meaning (inferred) |
|---|---|---|
| **Offline** (red) | `data.miners.now === 0` | No miners are currently connected to this Proxy. Possible causes: every rig is powered down / the Proxy just started and no miner has dialed in yet / every Stratum connection timed out and was kicked / all miners failed over to a backup Proxy. |
| **Warning** (yellow) | `0 < now < max × 0.5` | Active miner count is below half of the historical peak. Possible causes: rigs signing off after a peak hour / a batch dropped and hasn't reconnected yet / a pool outage triggered failover / a miner config change is rolling out. |
| **Online** (green) | `now >= max × 0.5` | Most of the historical miners are still connected and stable. |

### Known production pitfalls

1. **`max` is a sticky historical peak** — it does not reset to zero on
   restart. After a Proxy restart `max` will re-accumulate, but old
   peaks linger; if `max = 1000` and `now = 10`, the badge will show
   "Warning", not "Offline".
2. **`now` is instantaneous** — a 5-second pool blip can flicker the
   UI between "Offline" and "Online". The check has no rolling average.
3. **Health is not measured** — a miner rejecting 99 % of shares while
   still connected still counts as "Online". Watch the **Acceptance
   Rate** and **Latency** tiles in the Mining Results card alongside
   the badge.
4. **Proxy-restart transient** — `/1/summary` will return
   `miners.now = 0` for a brief moment after a Proxy restart, which
   the badge immediately paints as "Offline"; the miners reconnect
   within seconds.
5. **Cold-start false positive** — a freshly deployed Proxy has
   `max = 0, now = 0`. The check `0 < 0 × 0.5` is false, so the badge
   lights **green** on an empty Proxy, which is misleading.

### Ribbon vs. badge — don't confuse them

The dashboard carries two parallel status indicators that answer
different questions:

| Element | Question it answers | Driven by |
|---|---|---|
| Header Ribbon (dot + "Read-only viewer") | **Login state**: am I successfully talking to a Proxy right now? | `setRibbonConnectState("connected" \| "disconnected")` |
| Status badge (dot + Offline / Warning / Online) | **Business state**: are there enough miners connected? | `getStatusInfo(data.miners)` |

Ribbon green = the last `/1/summary` returned 2xx. Ribbon yellow =
no config saved, or a 401 / connect failure happened. The badge
text only updates after a successful `/1/summary`; if the Ribbon is
yellow the badge text is whatever was last rendered and should not
be trusted.

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
