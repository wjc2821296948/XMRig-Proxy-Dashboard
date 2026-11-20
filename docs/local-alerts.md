# 本地告警使用指南 / Local Alerts Guide

本指南适用于仓库中本地告警功能对应的设置与浏览器通知。所有阈值判断都在当前浏览器中完成，不需要额外服务器、数据库、Webhook 或付费服务。

## 中文

### 配置阈值

1. 使用 HTTPS 或 `http://localhost` 打开 Dashboard，并连接 XMRig Proxy。
2. 点击右上角 **设置**，滚动到 **本地告警设置**。
3. 按需填写阈值，然后点击 **保存告警设置**。该按钮只保存告警偏好，不会保存或切换 Proxy 配置，也不会重新连接。

| 设置 | 单位与触发条件 | 关闭方式 |
|---|---|---|
| 最低总算力 | KH/s；当前总算力严格低于阈值时告警 | 留空 |
| 最低活跃矿工数 | 个；活跃矿工数严格低于阈值时告警 | 留空 |
| 最高拒绝份额比例 | 百分比；拒绝份额比例严格高于阈值时告警 | 留空 |
| 告警冷却时间 | 秒；同一告警再次通知前的最短间隔，范围 0–86400 秒 | 0 表示不等待 |

默认不启用任何阈值。算力和矿工数不能小于 0；矿工数必须为整数；拒绝比例必须在 0–100 之间。缺失、负数或非有限监控数据不会被当作有效的正常值或违规值；拒绝份额计数缺失或总数为 0 时，不计算拒绝比例。

告警按状态变化发送，不会在每次刷新时重复通知。处于冷却期的持续告警会等待冷却时间结束后再通知一次；条件恢复后再次触发仍受冷却时间约束。切换 Proxy 配置或重新载入页面会重置当前页面中的告警状态。

### 开启浏览器通知

1. 在设置的 **本地告警设置** 区域，点击 **请求浏览器通知权限**。
2. 在浏览器弹出的权限提示中选择允许。
3. 勾选 **接收浏览器通知**。取消勾选即可停止系统通知；这不会撤销浏览器站点级别的授权。
4. 重新启用通知不会清空已跟踪的告警状态。关闭期间仍会评估告警状态但不发送通知；持续中的告警不会因重新启用而重复通知，之后恢复并再次触发时仍可通知。
5. 如之前拒绝过权限，请到浏览器的站点设置中重新允许通知。

只有在点击权限按钮时才会请求授权；页面加载、连接 Proxy 或保存阈值时都不会自动弹出权限提示。浏览器不支持通知 API 时，该选项会被禁用。浏览器通知通常要求 HTTPS 或 localhost 安全上下文。

界面目前支持简体中文与 English。浏览器中出现其他语言值时，按 Dashboard 统一的语言策略回退到简体中文；通知文案与界面使用相同策略。

### 运行范围和隐私

- 告警只在 Dashboard 页面处于前台可见、并成功获取新的 `/1/summary` 数据时评估。标签页隐藏时自动刷新会暂停；关闭页面后不会在后台运行。因此它不是常驻监控服务，也不能保证页面关闭或被浏览器挂起时发出通知。
- 离线缓存中的旧快照只用于展示，不会触发新告警。
- 阈值与通知开关保存在当前浏览器的 `localStorage` 专用键中，与 Proxy URL、Access Token 和 Proxy 配置分开；不会上传到面板服务器。
- 系统通知只包含通用告警原因，不包含 Proxy 地址、Token、矿工原始数据或 API 响应。
- 通知由浏览器和操作系统管理。浏览器、操作系统的通知设置或勿扰模式仍可能阻止展示。
- 本功能不提供 Webhook、远程推送或服务端告警。

## English

### Configure thresholds

1. Open the dashboard over HTTPS or `http://localhost`, then connect to your XMRig Proxy.
2. Select **Settings** in the upper-right corner and scroll to **Local alert settings**.
3. Enter the thresholds you need and select **Save alert settings**. This action saves alert preferences only; it does not save or switch a Proxy profile and does not reconnect.

| Setting | Unit and trigger | Disable |
|---|---|---|
| Minimum total hashrate | KH/s; alert when current total hashrate is strictly below the threshold | Leave blank |
| Minimum active miners | Count; alert when the active miner count is strictly below the threshold | Leave blank |
| Maximum rejected-share percentage | Percent; alert when the rejected-share ratio is strictly above the threshold | Leave blank |
| Alert cooldown | Seconds; minimum interval before the same alert can notify again, from 0 to 86,400 seconds | Set to 0 for no wait |

All thresholds are disabled by default. Hashrate and miner thresholds cannot be negative; miner count must be an integer; rejected-share percentage must be between 0 and 100. Missing, negative, or non-finite metrics are not treated as valid healthy or breached values. The rejected-share ratio is not calculated when counters are missing or their sum is zero.

Alerts are transition-based and are not repeated on every refresh. A breach that remains active during cooldown is sent once after the cooldown expires; a later recurrence is still subject to cooldown. Switching Proxy profiles or reloading the page resets the in-memory alert state for that page.

### Enable browser notifications

1. In **Local alert settings**, select **Request browser notification permission**.
2. Choose Allow in the browser's permission prompt.
3. Enable **Receive browser notifications**. Uncheck it to stop system notifications; this does not revoke the browser's site-level permission.
4. Re-enabling notifications does not clear tracked alert state. Alerts continue to be evaluated while notifications are off, but delivery is suppressed; an ongoing breach is not repeated just because notifications are re-enabled. A later recovery and new breach can still notify.
5. If permission was denied earlier, allow notifications again in your browser's site settings.

Permission is requested only after the permission button is clicked. Loading the page, connecting to a Proxy, and saving thresholds never trigger a permission prompt. The option is disabled when the browser does not support the Notifications API. Browser notifications generally require a secure context (HTTPS or localhost).

The UI currently supports Simplified Chinese and English. Other locale values fall back to Simplified Chinese under the dashboard's shared locale policy; notification copy follows the same policy.

### Runtime and privacy

- Alerts are evaluated only while the dashboard page is visible and a fresh `/1/summary` request succeeds. Automatic refresh pauses when the tab is hidden; nothing monitors in the background after the page is closed. This is not a persistent monitoring service and cannot guarantee notifications while the page is closed or suspended by the browser.
- Old offline-cache snapshots are display-only and never trigger alerts.
- Thresholds and the notification toggle are stored in a dedicated browser `localStorage` key, separate from Proxy URLs, access tokens, and Proxy profiles. They are never uploaded to the dashboard server.
- System notifications contain only a generic alert reason. They do not include Proxy addresses, tokens, raw miner data, or API responses.
- The browser and operating system control notification delivery. Their notification settings and Do Not Disturb modes may still suppress notifications.
- This feature does not provide webhooks, remote push, or server-side alerts.
