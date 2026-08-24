# Security Policy

[English](SECURITY_en.md) | [中文](SECURITY.md)

---

## Supported Versions

Only the latest version (`main` branch) receives security updates.

| Version | Status |
|---------|--------|
| `main` (latest) | ✅ Supported |
| Older versions | ❌ No longer supported |

---

## Reporting a Vulnerability

**Do NOT disclose security vulnerabilities in public Issues, Pull Requests, or Discussions.**

If you discover a security vulnerability in this project, please report it via **GitHub Security Advisories**:

1. Go to the repository's **Security** tab
2. Click **Report a vulnerability**
3. Fill in the vulnerability details and submit

We will assess and fix reported vulnerabilities as soon as possible.

---

## Risks of Public Disclosure Before Fix

If a security vulnerability is publicly disclosed before being fixed, it may lead to the following risks:

| Risk Type | Description |
|-----------|-------------|
| **Credential Leakage** | Attackers may obtain the user's configured XMRig Proxy `access-token`, allowing them to control pool connections, steal hashrate, or tamper with configuration |
| **Man-in-the-Middle Attack** | If the vulnerability involves the communication channel, attackers can intercept or modify requests/responses between the browser and Proxy |
| **XSS / Code Execution** | Frontend injection vulnerabilities may lead to malicious scripts executing in users' browsers, stealing Tokens from `localStorage`/`sessionStorage` |
| **Denial of Service** | Crafted requests may cause the Proxy service to crash or the panel to fail to load, affecting monitoring availability |
| **Information Disclosure** | Sensitive runtime metrics (hashrate, miner IPs, upstream pool addresses, etc.) may be accessed by unauthorized parties |

> **Core Principle**: This project adopts a **Zero Knowledge Architecture** — the server only serves static files and has no knowledge of users' Proxy addresses or Tokens. All API requests are made directly from the browser to the user's self-hosted Proxy. Therefore, **the impact of any vulnerability is limited to the user's browser and their own Proxy**, and does not affect the deployment site (GitHub Pages / Cloudflare Pages, etc.) or other users.

---

## Security Best Practices (For Users)

To minimize the impact of potential vulnerabilities, users are advised to:

1. **Set a strong random `access-token` for the Proxy**, and rotate it periodically
2. **Enable `restricted: true` in the Proxy configuration**, allowing only read-only endpoints (`/1/summary`)
3. **Access the panel and Proxy via HTTPS** (import self-signed certificates into browser trust store, or use VPN/tunnel)
4. **Regularly clear browser storage**, or use "Session Mode" (do not check "Remember Me")
5. **Monitor this repository's Security Advisories** and update the panel promptly

---

## Acknowledgments

Thank you to all security researchers who responsibly disclose vulnerabilities.

---

## License

Apache License 2.0 © 2025