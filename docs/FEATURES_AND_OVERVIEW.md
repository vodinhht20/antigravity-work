# Gravity Panel v0.4.0

| Luồng | Hành vi |
| --- | --- |
| Hội thoại | Chat streaming qua Antigravity CLI, Markdown, sao chép phản hồi, dừng yêu cầu, lịch sử tìm kiếm được. Backend SDK tùy chọn. |
| Ngữ cảnh website | Đính kèm văn bản trang hoặc vùng bôi đen, xem trước và gỡ từng mục, tối đa ba mục. Tab có thể được chọn bằng `@` khi Chrome cho phép đọc tiêu đề và địa chỉ của tab đó. |
| Tương tác | Chọn nguồn dữ liệu trực tiếp từ trình duyệt, mở liên kết bằng chuột hoặc bàn phím. Đầu ra model được hiển thị dưới dạng nội dung hội thoại. |
| Quyền | Truy cập tạm qua `activeTab` hoặc lưu quyền cho một website từ bản xem trước. Trang chỉ được đọc khi người dùng bấm đính kèm. Service worker kiểm tra lại tài liệu trước khi gửi. |
| Kết nối | Native Messaging theo phiên bản giao thức. Tự nhận diện hoặc chọn CLI/SDK, có đường dẫn CLI thủ công, kết nối lại có giới hạn và giữ bản nháp khi gặp lỗi. |
| Giao diện | Sáng, tối hoặc theo hệ thống. Side panel co giãn, điều hướng lệnh và tab bằng bàn phím, xử lý Enter khi đang gõ tiếng Việt. |

## Đường đi của dữ liệu

1. Người dùng chọn trang hoặc vùng bôi đen. Extension lấy văn bản hiển thị từ tài liệu chính, bỏ các trường nhập và khu vực bị ẩn, giới hạn độ dài và ẩn một số mẫu dữ liệu nhạy cảm. Một số trang đăng nhập, thanh toán hoặc xác minh bị chặn.
2. Extension giữ ngữ cảnh chờ trong bộ nhớ của worker. Trang đổi tài liệu, đóng tab, thu hồi quyền hoặc đóng panel làm mục liên quan hết hiệu lực. URL đính kèm chỉ gồm origin, không có đường dẫn hoặc truy vấn.
3. Khi người dùng gửi, companion chuyển nội dung được chọn, tin nhắn và tối đa tám lượt văn bản trước đó tới backend đã chọn. CLI nhận dữ liệu qua stdin và trả về stream. Thao tác đang chạy chỉ nhận phản hồi từ request tương ứng.
4. Hội thoại sau khi kết thúc lưu ở `chrome.storage.local`. Cấu hình kết nối và chấp thuận dữ liệu cũng lưu cục bộ. Giao diện, model đã chọn và lệnh nhanh cá nhân có thể đồng bộ qua `chrome.storage.sync`. Nhật ký đính kèm lưu thời điểm và số mục.

Native Messaging hoạt động trên cùng máy với trình duyệt. Khi dùng nhiều máy, đăng ký companion và cấp quyền cho từng hồ sơ Chrome cần dùng. Chrome mobile có luồng Add to Desktop. Dịch vụ relay và MCP điều khiển Chrome không nằm trong bản beta; scaffold MCP cũ không tham gia luồng phát hành.

Xem [cài đặt](../README.md), [giao thức bridge](../packages/protocol/README.md) và [hồ sơ Chrome Web Store](CHROME_WEB_STORE.md).
