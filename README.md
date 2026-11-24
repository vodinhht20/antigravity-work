# Gecko for Antigravity (v0.6.0)

**Gecko for Antigravity** là Chrome Extension độc lập (Manifest V3) cung cấp Side Panel AI và **cánh tay điều khiển trình duyệt từ xa** tương thích Antigravity CLI, Antigravity App/IDE (qua MCP) và Antigravity Python SDK — hỗ trợ cả **macOS** và **Windows**.

## Cài đặt nhanh (1 dòng lệnh từ GitHub — không cần tải thư mục companion)

1. Load extension `packages/extension/dist` vào `chrome://extensions` (hoặc cài từ `gecko-for-antigravity-chrome-0.6.0.zip`).
2. Mở Side Panel → bấm **Sao chép lệnh cài** (đã tự điền sẵn Extension ID) và dán vào Terminal / PowerShell:
   - **macOS / Linux**:
     ```bash
     curl -fsSL https://raw.githubusercontent.com/vodinhht20/antigravity-work/main/install.sh | bash -s -- <EXTENSION_ID>
     ```
     *(Nếu máy Mac chỉ cài Antigravity App và chưa có `agy` CLI, thêm `--sdk` ở cuối lệnh).*
   - **Windows (PowerShell)**:
     ```powershell
     $env:GECKO_EXT_ID="<EXTENSION_ID>"; irm https://raw.githubusercontent.com/vodinhht20/antigravity-work/main/install.ps1 | iex
     ```
     *(Hoặc chỉ cần chạy `irm https://raw.githubusercontent.com/vodinhht20/antigravity-work/main/install.ps1 | iex`, bộ cài sẽ tự hỏi Extension ID).*
3. Bộ cài tự động:
   - Đăng ký Native Messaging Host cho Chrome/Edge/Brave/Chromium (có launcher wrapper nạp đầy đủ `PATH` trên macOS).
   - Tự đăng ký MCP Server `gecko-for-antigravity` vào `~/.gemini/antigravity/mcp_config.json` để **Antigravity App / IDE** ra lệnh trực tiếp cho Chrome.
   - Gợi ý cài thêm **Antigravity Python SDK (`--sdk`)** nếu máy chưa có `agy` CLI.
4. Quay lại Side Panel — extension tự động kiểm tra kết nối mỗi 3 giây và chuyển sang **Sẵn sàng**.

## Gỡ cài đặt companion (1 dòng lệnh)

- **macOS / Linux**:
  ```bash
  curl -fsSL https://raw.githubusercontent.com/vodinhht20/antigravity-work/main/uninstall.sh | bash
  ```
- **Windows (PowerShell)**:
  ```powershell
  irm https://raw.githubusercontent.com/vodinhht20/antigravity-work/main/uninstall.ps1 | iex
  ```

## Tính năng nổi bật

- **Tốc độ cao & không giới hạn bước**: Tự đính kèm snapshot ban đầu (~20ms), gộp nhiều thao tác trong 1 lượt AI (multi-tool batching), tự nén lịch sử bước cũ (rolling compression).
- **Con trỏ chuột ảo mượt & hiệu ứng click**: Di chuyển theo đường cong Bézier tự nhiên, hiệu ứng gợn sóng khi click, tự mở liên kết `target="_blank"` không bị chặn popup.
- **Chọn Model AI trực tiếp**, **menu chuột phải "Hỏi Gecko for Antigravity"**, **cấp quyền tương tác 1 lần** (`optional_host_permissions`).
- **Bảo vệ an toàn**: Luôn chặn mật khẩu, thanh toán, ngân hàng, CAPTCHA và che dữ liệu nhạy cảm.

## Hồ sơ Chrome Web Store
- [docs/STORE_LISTING.md](docs/STORE_LISTING.md)
- [docs/CHROME_WEB_STORE.md](docs/CHROME_WEB_STORE.md)
- [docs/PRIVACY_POLICY.md](docs/PRIVACY_POLICY.md)
