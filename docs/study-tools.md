# Học tiếp, giải thích, thống kê và offline

- Trong buổi ôn, **Tạm dừng** lưu câu hiện tại, lựa chọn, lần thử sai và câu đánh dấu. Ở Kho đề, **Học tiếp** mở lại bài đó. Thi thử vẫn chạy theo hạn chót, không có nút tạm dừng đồng hồ.
- Trong **Bộ đề trên thiết bị**, chọn **Giải thích đã duyệt** để đọc các bản đã được kiểm duyệt của câu đã lưu. Khi có mạng, ứng dụng đọc bản mới qua khóa giải thích đã biết; không tự gọi AI. Chưa được duyệt thì hiển thị trạng thái trống, không gắn nhãn duyệt cho gợi ý AI. Công cụ duyệt/sửa và báo lỗi hiện có vẫn được sử dụng.
- **Lịch sử & Kết quả** hiển thị thống kê từng môn: số câu trả lời đúng, đúng ngay lần đầu, bỏ trống, chuỗi kết quả gần nhất và câu thường sai. Phạm vi là tối đa 50 bài còn lưu trên thiết bị; không suy đoán chủ đề khi dữ liệu chưa có nhãn.
- **Tải để học offline** tải toàn bộ ảnh của môn đã nhập vào IndexedDB, bên cạnh câu hỏi và giải thích đã lưu. Bộ đề có thể mở sau khi tải lại trang trong trạng thái mất mạng. Chưa có giải thích thì không tạo thêm trong quá trình tải. Ảnh tải dở được giữ để tải tiếp, hoàn tất mới ghi nhận lần tải trong danh sách.
- Cần mở trang khi có mạng ít nhất một lần để service worker lưu ứng dụng. Dung lượng phụ thuộc trình duyệt; yêu cầu lưu bền được thử sau khi tải, nhưng không bảo đảm tồn tại khi người dùng xóa dữ liệu hoặc trình duyệt thu hồi dung lượng. Sao lưu ZIP hiện có là lựa chọn lưu trữ dài hạn.

Kiểm tra: `node --test tests/*.test.mjs`; browser QA `node scripts/browser-study-tools-qa.mjs` dùng profile QA riêng trên cổng 9223 và máy chủ local cổng 8080. Browser QA dùng dữ liệu tổng hợp, kiểm tra reload offline thật cùng ảnh đã tải, học tiếp, bản duyệt và các viewport/theme.
