# Hồ sơ Chrome Web Store · Gecko for Antigravity 0.6.0

## 1. Single Purpose Statement
> Independent companion extension that connects Chrome to a user's local Antigravity CLI (`agy`) and Desktop MCP to read web pages and execute user-requested browser interactions safely.

## 2. Giải trình từng quyền (Permission Justifications)

| Quyền | Giải trình cho Chrome Web Store Reviewer |
| --- | --- |
| `sidePanel` | Hiển thị giao diện trò chuyện **Gecko for Antigravity** cạnh trang web đang mở. |
| `activeTab` & `scripting` | Đọc nội dung trang, cấu trúc phần tử tương tác và thực thi thao tác click/điền form/cuộn trang kèm con trỏ ảo trực quan khi người dùng yêu cầu. |
| `nativeMessaging` | Giao tiếp cục bộ với companion (`com.antigravity.browser_bridge`) trên máy người dùng, giới hạn chặt theo Extension ID. |
| `storage` | Lưu lịch sử hội thoại, trạng thái đồng ý quyền riêng tư, cấu hình đường dẫn CLI tùy chọn, lựa chọn model AI, giao diện và lệnh nhanh cá nhân. |
| `contextMenus` | Thêm mục chuột phải **Hỏi Gecko for Antigravity** cho trang và đoạn văn bản được chọn. |
| `optional_host_permissions` (`https://*/*`, `http://*/*`) | Không yêu cầu quyền website bắt buộc lúc cài. Người dùng bấm **Cấp quyền tương tác 1 lần** (hoặc cấp theo từng website) khi muốn tương tác liên tục giữa các tab, và có thể thu hồi bất kỳ lúc nào trong Cài đặt. |

## 3. Tuân thủ Chính sách CWS & Bảo mật
- **Tên & Thương hiệu**: Sử dụng thương hiệu độc lập `Gecko for Antigravity`, biểu tượng xanh dương–ngọc riêng biệt, ghi rõ không thuộc Google LLC.
- **Không thu thập/lưu API key**: Extension chỉ kết nối qua Antigravity CLI (`agy`) cục bộ do người dùng tự đăng nhập trên máy.
- **Không tải mã từ xa (No Remote Code)**: Toàn bộ JS/CSS đóng gói sẵn trong ZIP.
- **Chặn trang & trường nhạy cảm**: Chặn `input[type=password]`, `autocomplete="cc-*"`, trang ngân hàng/thanh toán/đăng nhập, CAPTCHA/Turnstile; tự động ẩn token/API key.
- **Local Relay an toàn**: Chỉ bind trên `127.0.0.1`, port ngẫu nhiên, token 48 ký tự hex, tự hủy khi đóng phiên.

## 4. Hướng dẫn kiểm thử cho Reviewer (macOS & Windows)
1. Cài extension từ `gecko-for-antigravity-chrome-0.6.0.zip`.
2. Mở Side Panel → trên Setup Wizard, bấm **Sao chép lệnh cài** (1 dòng lệnh từ repo công khai `https://github.com/vodinhht20/antigravity-work`, tự cài `agy` CLI nếu máy chưa có và đăng ký companion cho đúng Extension ID) và chạy trong Terminal / PowerShell.
3. Chạy `agy` một lần trong terminal để đăng nhập tài khoản Google/Antigravity. Side Panel tự nhận kết nối (**Sẵn sàng · CLI**) và tự tải danh sách model thật trong vòng 3 giây.
4. Trên thẻ chấp thuận quyền riêng tư, bấm **Tiếp tục & cấp quyền 1 lần**.
5. Mở một trang công khai (ví dụ `https://example.com`), yêu cầu *"Click vào liên kết đầu tiên"* → quan sát con trỏ ảo Gecko di chuyển và hiệu ứng click.
6. Thử chuột phải trên văn bản → chọn **Hỏi Gecko for Antigravity**.
7. Vào **Cài đặt → Quyền tương tác trình duyệt** → bấm **Thu hồi quyền toàn trình duyệt** để xác minh khả năng thu hồi.
8. Gỡ companion bằng 1 dòng lệnh `uninstall.ps1` / `uninstall.sh` trong mục Cài đặt.
