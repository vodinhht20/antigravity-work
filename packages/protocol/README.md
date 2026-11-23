# Gravity Panel · Native Messaging protocol v2

Transport là Chrome Native Messaging trên stdio. Mỗi frame là độ dài unsigned 32-bit theo byte order của máy và một JSON object UTF-8. Bridge giới hạn mỗi frame 1 MiB. Luồng kết nối bắt đầu bằng `hello`; companion kiểm tra phiên bản trước khi nhận chat.

| Hướng | Loại | Dữ liệu |
| --- | --- | --- |
| Extension → bridge | `hello` | `payload.protocol = 2`, `payload.config.backend = auto / cli / sdk`, `payload.config.cliPath` tùy chọn |
| Bridge → extension | `hello.result` | `payload.protocol`, `payload.version` và `payload.backend` hoặc `payload.code` |
| Extension → bridge | `chat` | `id`, `payload.message`, `payload.model` tùy chọn, `payload.contexts` tối đa ba mục, `payload.history` tối đa tám mục |
| Bridge → extension | `chat.delta` | `id`, `payload.text` |
| Bridge → extension | `chat.done` | `id` |
| Bridge → extension | `error` | `id`, `payload.code` |
| Extension → bridge | `cancel` | `id` của yêu cầu đang chạy |

Một mục `context` có `url` (chỉ origin), `title`, `content` và `redactedCount`. Một mục `history` có `role` và `content`. Companion không cung cấp API để model yêu cầu worker đọc tab hoặc thực hiện lệnh trình duyệt qua giao thức này.
