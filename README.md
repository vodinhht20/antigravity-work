# Gecko for Antigravity (v0.6.0)

**Gecko for Antigravity** là Chrome Extension độc lập (Manifest V3) giao tiếp trực tiếp qua **Antigravity CLI (`agy`)** và hỗ trợ **cánh tay điều khiển trình duyệt từ xa (MCP)** cho **Antigravity Desktop / IDE** trên cả **macOS** và **Windows**.

## Cài đặt nhanh (1 dòng lệnh — tự cài CLI + Companion + MCP)

1. Tải và load extension từ `gecko-for-antigravity-chrome-0.6.0.zip` (hoặc `packages/extension/dist`) trong `chrome://extensions`.
2. Mở Side Panel → bấm **Sao chép lệnh cài** (đã tự điền sẵn Extension ID) và dán vào Terminal / PowerShell:
   - **Windows (PowerShell)**:
     ```powershell
     irm https://raw.githubusercontent.com/vodinhht20/antigravity-work/main/install.ps1 | iex; Install-Gecko <EXTENSION_ID>
     ```
   - **macOS / Linux (Terminal)**:
     ```bash
     curl -fsSL https://raw.githubusercontent.com/vodinhht20/antigravity-work/main/install.sh | bash -s -- <EXTENSION_ID>
     ```
3. Bộ cài sẽ tự động:
   - Kiểm tra và cài đặt **Antigravity CLI (`agy`)** chính thức từ `antigravity.google` nếu máy chưa có.
   - Cài đặt companion và đăng ký Native Messaging Host cho Chrome, Edge, Brave, Chromium (tương thích cả Python 3.9+ sẵn có trên macOS).
   - Tự đăng ký MCP Server `gecko-for-antigravity` vào `~/.gemini/antigravity/mcp_config.json` cho Antigravity Desktop / IDE.
4. Nếu vừa mới cài `agy` lần đầu, mở terminal gõ `agy` để đăng nhập 1 lần bằng tài khoản Google/Antigravity (không cần API key). Side Panel sẽ tự chuyển sang **Sẵn sàng · CLI** và tự nạp danh sách model thật từ `agy models`.

## Gỡ cài đặt companion (1 dòng lệnh)

- **Windows (PowerShell)**:
  ```powershell
  irm https://raw.githubusercontent.com/vodinhht20/antigravity-work/main/uninstall.ps1 | iex
  ```
- **macOS / Linux (Terminal)**:
  ```bash
  curl -fsSL https://raw.githubusercontent.com/vodinhht20/antigravity-work/main/uninstall.sh | bash
  ```

## Tính năng nổi bật

- **Giao tiếp trực tiếp qua Antigravity CLI**: Không cần API key, tự động đồng bộ danh sách model khả dụng theo tài khoản (`agy models`).
- **Tốc độ cao & không giới hạn bước**: Tự chụp snapshot ban đầu (~20ms), gộp nhiều thao tác trong 1 lượt AI (multi-tool batching), tự nén lịch sử bước cũ (rolling compression).
- **Con trỏ chuột ảo mượt & hiệu ứng click**: Di chuyển theo đường cong Bézier tự nhiên, hiệu ứng gợn sóng khi click, hỗ trợ mở liên kết `target="_blank"`.
- **Cánh tay từ xa MCP**: Điều khiển Chrome trực tiếp từ Antigravity Desktop / IDE qua loopback relay bảo mật (`127.0.0.1` + token ngẫu nhiên).
- **An toàn & quyền riêng tư**: Cấp quyền tương tác 1 lần qua `optional_host_permissions`, luôn chặn mật khẩu, thanh toán, ngân hàng, CAPTCHA và che dữ liệu nhạy cảm.

## Hồ sơ Chrome Web Store
- [docs/STORE_LISTING.md](docs/STORE_LISTING.md)
- [docs/CHROME_WEB_STORE.md](docs/CHROME_WEB_STORE.md)
- [docs/PRIVACY_POLICY.md](docs/PRIVACY_POLICY.md)
