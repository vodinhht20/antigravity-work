# Privacy Policy — Gecko for Antigravity

**Effective Date:** November 24, 2026  
**Publisher:** Gecko ([Organization / Developer Name])  
**Contact:** [Support Email]

## 1. Overview

**Gecko for Antigravity** ("the Extension") is an independent Chrome browser extension (not affiliated with or endorsed by Google) that connects Chrome to a local companion process backed by **Antigravity CLI (`agy`)** and **Antigravity Desktop MCP** on the user's own computer.

## 2. Data We Access and Process

The Extension accesses web page content **only when initiated by the user** (via chat, attaching a page, right-click context menu, or invoking a browser tool through the local MCP relay):

- **User Prompts & Conversation History**: Messages you type in the side panel and up to 8 recent turns are sent to your local companion and forwarded to your local Antigravity CLI (`agy`) to generate responses.
- **Page Content & Interactive Elements**: When you attach a page or request a browser action, the Extension reads visible text and interactive DOM metadata (`tag`, `role`, `label`, `value` for non-sensitive fields) from the target tab.
- **Automatic Sensitive Data Protection**:
  - Password fields (`input[type=password]`), credit card fields (`autocomplete="cc-*"`), CAPTCHA/Turnstile frames, and known banking/payment/login URLs are **blocked** from automated reading and interaction.
  - Common secret patterns (API keys, personal tokens, 13–19 digit card-like numbers) are automatically redacted (`[đã ẩn]`) before leaving the browser.
  - Credentials, cookies, and API keys are never collected or stored by the Extension.

## 3. Data Storage

- **Local Chrome Storage (`chrome.storage.local`)**: Stores your conversation history (capped at 40 conversations / 4 MB), consent choice, optional custom CLI path, and minimal activity counts (timestamp, action type, count — no page text).
- **Chrome Sync Storage (`chrome.storage.sync`)**: Stores UI preferences only (theme, selected AI model, custom slash prompts).
- **No Third-Party Tracking or Ads**: The Extension contains no analytics SDKs, no advertising trackers, and no remote-hosted executable code.

## 4. Data Sharing & Local Companion

All communication between the Extension and Antigravity travels strictly through Chrome Native Messaging on your local machine (`com.antigravity.browser_bridge`). The optional MCP remote-arm relay binds exclusively to loopback (`127.0.0.1`) with a per-session random authentication token. Data processed by Antigravity CLI is governed by Google's applicable terms and privacy policy.

## 5. User Controls & Deletion

You can at any time delete conversations in **History**, clear activity logs in **Settings**, revoke browser permissions in **Settings → Quyền tương tác trình duyệt** (or `chrome://extensions`), and uninstall the companion via the 1-line `uninstall.sh` / `uninstall.ps1` script.

## 6. Chrome Web Store Limited Use Disclosure

The use of information received from Chrome APIs adheres to the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq), including the Limited Use requirements.
