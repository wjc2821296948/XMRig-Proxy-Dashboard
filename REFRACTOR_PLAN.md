# Refactor & Enhancement Plan for XMRig-Proxy Dashboard

## Overview
The goal is to refactor the existing pure‑HTML/JS/CSS dashboard into a **modular, ES‑module based, zero‑knowledge front‑end** while preserving the current UI/UX and data flow. All enhancements (authentication UI, settings, storage handling, loading skeletons, toast notifications, responsive design, etc.) will be implemented **without introducing any back‑end, database, or heavy front‑end framework**.

---

## 1. Project Structure
```
XMRig-Proxy-UI-Panel/
│   index.html                # Main entry – will load main.js as a module
│   styles.css                # Existing styling + new CSS variables & responsive tweaks
│   README.md                 # Re‑written documentation (see task 5)
│   CLAUDE.md                 # Project memory with design principles (see task 6)
│   REFRACTOR_PLAN.md          # This plan (presented for approval)
│   .gitignore                # Ignored files (already added)
│
├── src/                     # New source folder for ES‑modules
│   ├── api.js               # Centralised XMRig‑Proxy API wrapper (fetch with auth)
│   ├── storage.js           # Handles Remember‑Me logic (localStorage / sessionStorage)
│   ├── ui.js                # Rendering helpers, skeletons, toast, loading animation
│   └── main.js              # Application bootstrap, event wiring, auto‑refresh loop
│
└── assets/                 # Optional: images, icons, etc.
```

*All existing files (index.html, styles.css, script.js) will be phased out or refactored.*

---

## 2. Core Modules & Responsibilities
| Module | Responsibility |
|--------|----------------|
| `api.js` | Export `request(path, options)` that automatically prefixes the configured base URL, injects `Authorization: Bearer <token>` header, applies timeout, parses JSON, normalises error handling (401/403 → trigger logout, 4xx/5xx → toast, network errors → toast). No token is ever logged; when debugging we log `Bearer **********`.
| `storage.js` | Functions `saveConfig({url, token, remember})`, `loadConfig()`, `clearConfig()`. Handles the Remember‑Me switch: if `remember===true` → `localStorage`, else → `sessionStorage`. Provides a reactive getter for the current config.
| `ui.js` | Helper functions: `showSkeleton()`, `hideSkeleton()`, `showToast(message, type)`, `renderDashboard(data)`, `renderError(msg)`, `renderConfigForm(config)`. All DOM manipulation uses `textContent` or `createElement` – **no `innerHTML` with unsanitised data**.
| `main.js` | Entry point (`type="module"`). On load: `loadConfig()`. If config missing → call `ui.renderConfigForm()`. Otherwise call `fetchAndRender()`. Sets up `setInterval` (10 s) for auto‑refresh. Listens to UI events: Connect, Cancel, Settings, Logout, Remember‑Me toggle.

---

## 3. UI Enhancements
1. **Skeleton Loading** – while awaiting the first API call, display placeholder cards with CSS animation.
2. **Toast Notifications** – small transient messages for success, warning, error (e.g., connection failure, token expired).
3. **Responsive Layout** – use CSS Grid `auto-fit/minmax` (already present) plus media queries for mobile‑first breakpoints.
4. **Dark‑Theme Optimisation** – CSS variables for colours; ensure contrast ratios meet WCAG AA.
5. **Loading Spinner** – on each fetch show a spinner inside the dashboard area.
6. **Empty / Error States** – friendly messages when API returns no data or when a network error occurs.
7. **Settings Modal** – a button (gear icon) opens a modal where the user can edit API URL, Token, and Remember‑Me switch. Saving re‑validates the connection immediately.
8. **Logout Button** – clears stored config and returns to the connection screen.

All new UI components will be built with plain HTML/CSS; no external UI library is introduced.

---

## 4. Security Measures
- **Token Handling** – token is only ever stored in the browser storage chosen by the Remember‑Me flag. All logs mask the token (`Bearer **********`).
- **XSS Mitigation** – No `innerHTML` with external data. All dynamic values inserted via `textContent` or attribute setters. API URL is taken from user input and never evaluated.
- **Content‑Security‑Policy** – Add a minimal CSP meta tag in `index.html` (`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'`) to harden the page.
- **Network Errors** – Centralised error handling in `api.js` ensures the UI never displays raw error objects.
- **Zero‑Knowledge** – No request is ever sent to the host server; all fetches go straight to the user‑provided XMRig‑Proxy endpoint.

---

## 5. Documentation (README)
Create a fresh `README.md` covering:
- Project description and Zero‑Knowledge architecture.
- Features list (real‑time monitoring, authentication, Remember‑Me, etc.).
- Deployment steps – static hosting (GitHub Pages, Netlify, Vercel, plain web server).
- Usage – how to open, configure, and interact.
- API workflow explanation.
- Storage strategy (local vs session storage).
- Security considerations (no token leakage, CSP, XSS mitigation).
- FAQ (common errors, token expiry, CORS issues).
- Contributing guidelines.

---

## 6. Project Memory (`CLAUDE.md`)
Rewrite the existing `CLAUDE.md` to serve as a **project‑level memory** for Claude Code. It will contain:
- Positioning rationale for a pure front‑end, zero‑knowledge design.
- Architectural diagram (Browser → HTML/JS/CSS → XMRig‑Proxy API).
- Development principles (no back‑end, no heavy frameworks, module‑based, security‑first).
- Decisions made during this refactor (why we dropped `.env`, why we store tokens only client‑side, why we kept static deployment).
- Future extension notes (optional proxy server mode, theming, additional metrics).

---

## 7. Git Repository Init
- Run `git init`.
- Commit initial structure after the refactor is complete.
- Include `.gitignore` (already added).

---

## 8. Implementation Timeline (Tasks)
| ID | Subject | Description | Owner | Status |
|----|---------|-------------|-------|--------|
| 1 | Set up project skeleton | Create `src/` folder, add placeholder module files, update `index.html` to load `src/main.js` as a module. | Claude | pending |
| 2 | Implement `storage.js` | Remember‑Me logic, load/clear config, token masking. | Claude | pending |
| 3 | Implement `api.js` | Central fetch wrapper with auth, timeout, error normalisation. | Claude | pending |
| 4 | Implement UI helpers (`ui.js`) | Skeletons, toast, render functions, modal handling. | Claude | pending |
| 5 | Refactor dashboard logic into `main.js` | Wire events, auto‑refresh, initial connection flow. | Claude | pending |
| 6 | Update CSS for modern theme & responsiveness | Variables, skeleton placeholders, spinner, toast styling. | Claude | pending |
| 7 | Add Settings modal & Logout button | UI elements, bind to storage & API re‑connect. | Claude | pending |
| 8 | Write new `README.md` | All required sections. | Claude | pending |
| 9 | Rewrite `CLAUDE.md` (project memory) | Design rationale, principles, future directions. | Claude | pending |
|10 | Git init & final commit | Add `.gitignore`, ensure repository is clean. | Claude | pending |

---

## 9. Acceptance Criteria
- All existing dashboard features work exactly as before (data displayed, auto‑refresh every 10 s).
- New authentication flow validates the token before saving; invalid tokens show an error toast.
- Remember‑Me persists across browser sessions; when disabled, data is cleared on tab close.
- Logout completely removes stored credentials and returns to the config screen.
- No token ever appears in console logs or network requests to the host domain.
- UI passes manual XSS checks (no `innerHTML` with user data).
- Project builds and runs by simply opening `index.html` or serving the folder statically.
- Documentation and CLAUDE.md are complete and accurate.

---

## 10. Next Steps
1. **Approve this plan** – once approved, we will start implementing tasks sequentially.
2. **Create the module files** and adjust `index.html`.
3. **Iteratively develop and test** each module, committing after each functional milestone.

---

*End of plan*