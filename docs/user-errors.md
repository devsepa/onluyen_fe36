# Thông báo lỗi có vị trí và hướng xử lý

`dist/user-errors.mjs` chuẩn hóa lỗi ở các luồng đọc tài liệu Google, kiểm tra/tải ảnh, giải thích AI, lưu dữ liệu và tải danh sách cộng đồng. Thông báo gồm thao tác, tên tài liệu và slide nếu biết, nguyên nhân xác định được, hành động tiếp theo và mã lỗi/HTTP status.

- Không kết luận phiên Google hết hạn khi chỉ có lỗi mạng. Chỉ hướng dẫn kết nối lại khi có căn cứ như HTTP 401.
- Tách quyền truy cập (403), không tìm thấy trong quyền hiện tại (404), máy chủ lỗi (5xx), dữ liệu ảnh không đọc được và chưa nhận được phản hồi mạng.
- Phân biệt hàng đợi AI với giới hạn lượt dùng chung. Không khẳng định người dùng đã dùng hết quota cá nhân.
- Giữ mã điều khiển nội bộ như `AI_IMAGE_INVALID` để bỏ qua đúng ảnh lỗi, đồng thời cho thông báo dễ hiểu. Không thay đổi thời gian chờ, chấm điểm hoặc đáp án vì đổi thông báo lỗi.
- Lỗi chưa xác định được nguyên nhân phải nói rõ điều đó. Không hiển thị stack, URL có chữ ký, token, khóa API hoặc nội dung phản hồi thô.
- Màn hình lỗi ảnh có nút sao chép thông tin lỗi an toàn. Bản đối chiếu nhập lưu lý do kèm tài liệu và số slide, để tìm lại đúng chỗ cần sửa.

Kiểm tra: `tests/user-errors.test.mjs`, toàn bộ bộ test và `scripts/browser-user-errors-qa.mjs` trên profile QA riêng (Chrome cổng 9223, app local 8080). Các mã HTTP và lỗi AI trong browser QA là giả lập.
