# Kiểm tra và duyệt slide sau khi nhập

Trong tab **Tài liệu**, phần **Kiểm tra & duyệt từng slide** xuất hiện sau khi đọc tài liệu Google Slides. Báo cáo giữ cả trang đã nhập, bị bỏ qua, chưa nhận diện, ngoài phạm vi và chưa quét do giới hạn số câu. Đọc được ghi chú đáp án không được coi là đã kiểm tra đầy đủ ảnh/lựa chọn.

- Ảnh của các thẻ đang xem được tải theo nhu cầu. **Kiểm tra tải ảnh** kiểm tra từng slide trong phạm vi; có thể dừng và giữ kết quả đã kiểm tra. Lỗi tải ảnh được lưu theo số slide, có nút thử lại và link slide gốc.
- **Tải lại nội dung** đọc lại tài liệu, không tự thay thế ngân hàng. Khi phiên bản nguồn thay đổi, slide cần được duyệt lại. Quyết định thủ công chỉ được giữ khi phiên bản nguồn còn khớp.
- **Kiểm tra & duyệt** cho xem ảnh cạnh biểu mẫu trên PC, hoặc phía trên biểu mẫu trên điện thoại. Người dùng nhập nội dung gốc, chọn 2–8 lựa chọn, nhập đủ đáp án (AE/ACE) và giải thích riêng, rồi xác nhận đã đối chiếu. OCR có lựa chọn ngôn ngữ rõ ràng và chỉ đưa ra chữ tham khảo, không tự thay nội dung hay đáp án.
- Nếu ảnh lỗi, phải nhập đầy đủ các lựa chọn sau khi mở slide gốc thì mới được duyệt. Duyệt lưu câu có nguồn `manual`, xác nhận đáp án và thêm/cập nhật đúng slide; không nhân đôi. Đánh dấu không phải câu hỏi không tự xóa câu đã nhập trước đó.
- Danh sách được lưu riêng theo email tài khoản Google trên thiết bị, không chứa token hoặc URL ảnh có chữ ký. Đăng xuất/đổi tài khoản đóng bản xem trước và dừng tác vụ. Thiếu dung lượng lưu được báo rõ; dữ liệu trong phiên vẫn còn để xử lý.

Kiểm tra: `node --test tests/*.test.mjs` và `node scripts/browser-import-review-qa.mjs` trên browser QA riêng, cổng 9223, server local 8080. Browser QA dùng tài liệu/ảnh/tài khoản giả lập, không truy cập Google cá nhân thật.
