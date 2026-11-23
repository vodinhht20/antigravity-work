# Gravity Panel companion

Companion kết nối extension Gravity Panel với Antigravity trên cùng máy. Cần Python 3.10 trở lên có `pip` và `venv`, Internet khi cài, và Antigravity CLI 1.5.7 trở lên. Mở `agy` và đăng nhập một lần trước khi thử chat.

Từ thư mục `gravity-panel-companion` trong gói đã giải nén, chạy lệnh sau trên Windows.

```powershell
python scripts/install_host.py --extension-id "<EXTENSION_ID>" --browser chrome
```

Trên macOS hoặc Linux, chạy lệnh tương ứng.

```bash
python3 scripts/install_host.py --extension-id '<EXTENSION_ID>' --browser chrome
```

Lấy Extension ID từ `chrome://extensions` hoặc mục **Cài đặt → Kết nối Antigravity** trong panel. Mở lại side panel rồi chọn **Lưu và thử kết nối** nếu cần. Khi không tự phát hiện được CLI, chọn backend **Antigravity CLI** và nhập đường dẫn tuyệt đối tới `agy.exe` hoặc `agy`.

Để cài SDK tùy chọn, thêm `--sdk` khi cài và cấu hình `GEMINI_API_KEY` trong môi trường được trình duyệt kế thừa. Để hủy đăng ký, dùng `python scripts/install_host.py --uninstall --browser chrome` hoặc `python3` trên macOS/Linux.
