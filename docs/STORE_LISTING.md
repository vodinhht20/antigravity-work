# Chrome Web Store Listing — Gecko for Antigravity (v0.6.0)

## Extension Name
`Gecko for Antigravity`

## Short Description (≤ 132 chars)
- **EN**: Independent AI side panel & browser automation companion for Antigravity CLI and Desktop — read and control Chrome safely.
- **VI**: Trợ lý AI Side Panel và cánh tay điều khiển trình duyệt độc lập qua Antigravity CLI — đọc trang và thao tác an toàn.

## Detailed Description (EN)
**Gecko for Antigravity** is an independent companion extension for Antigravity (not affiliated with or endorsed by Google). It connects Chrome directly to **Antigravity CLI (`agy`)** via a local Native Messaging companion and exposes Chrome as a live remote arm for **Antigravity Desktop / IDE** via MCP.

**Key Features**
- **Direct Antigravity CLI Integration**: Uses your local `agy` CLI session (no API keys stored in Chrome) and automatically loads the exact models available on your account.
- **Live Browser Automation with Visual Feedback**: Ask Gecko to click links/emails, fill forms, select options, scroll pages, or manage tabs. A smooth virtual cursor and click ripple show every action clearly in real time.
- **Fast Multi-Step Execution**: Initial page snapshot + multi-tool batching + automatic rolling history compression keep multi-step tasks fast and accurate.
- **Remote Arm for Antigravity Desktop / IDE (MCP)**: Execute browser actions directly from Antigravity Desktop or IDE through an authenticated loopback (`127.0.0.1`) relay.
- **One-Line Companion Setup & Right-Click Ask**: Install or uninstall the companion in one command on Windows, macOS, or Linux, or right-click any page/selection and choose **Hỏi Gecko for Antigravity**.
- **One-Time Permission & Built-in Safety**: Uses optional host permissions (revocable anytime). Always blocks password inputs, payment/checkout pages, banking domains, and CAPTCHAs; redacts sensitive tokens before sending.

**Requirements**
- Desktop Chrome 116+ (macOS, Windows, Linux)
- Local companion installed via the 1-line command from `https://github.com/vodinhht20/antigravity-work` (automatically installs Antigravity CLI `agy` if missing).

## Category
`Productivity`

## Required Store Graphic Assets Checklist
- [x] Extension Icons: `16x16`, `32x32`, `48x48`, `128x128` (`packages/extension/public/icons/`)
- [ ] Store Icon: `128x128` PNG (`packages/extension/public/icons/icon128.png`)
- [ ] Screenshots: 1–5 ảnh `1280x800` PNG/JPEG (24-bit, không alpha)
- [ ] Privacy Policy URL: host `docs/PRIVACY_POLICY.md` lên URL công khai (ví dụ GitHub Pages hoặc raw/blob URL trên repo công khai)
