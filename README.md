# Slide Ôn Thi

Ứng dụng tĩnh, không cần build. Phục vụ thư mục `dist` qua HTTP, không mở trực tiếp bằng file://.

## Cấu hình Google

1. Tạo Google Cloud project và bật Google Slides API.
2. Cấu hình Google Auth Platform: branding, audience và scope `https://www.googleapis.com/auth/presentations.readonly`. Khi ở Testing, thêm Gmail được phép xem tài liệu vào Test users.
3. Tạo OAuth Client ID loại Web application. Thêm origin của web vào Authorized JavaScript origins (không có path). Với local có thể dùng http://localhost:8080.
4. Trong web chọn Cấu hình Google, dán Client ID. Client ID là thông tin công khai; không nhập Client Secret.
5. Kết nối Google bằng đúng tài khoản có quyền xem slide. Dán link rồi nhập.

Google Identity Services token model; token chỉ tồn tại trong bộ nhớ và được cấp lại bằng thao tác người dùng khi hết hạn. Ứng dụng gọi Google Slides API trực tiếp. Không chuyển token hoặc tài liệu tới backend/AI. OAuth chỉ cấp quyền đọc Slides, không tạo một tài khoản ứng dụng riêng.

## Phạm vi

Trích câu hỏi có lựa chọn A. B. C. D. hoặc A) B) trên các dòng riêng trong một slide; hỗ trợ shape, group và table. Đáp án đơn lấy từ speaker notes dạng `A` hoặc `Answer: A` hoặc `Đáp án: A`. Mọi câu nhập đều cần xác nhận trước khi thi. Báo các slide bị bỏ qua. Chưa hỗ trợ OCR, câu nhiều đáp án, tự sinh câu mới bằng AI hoặc giải thích bằng AI.

Câu hỏi, Client ID, bài đang làm và tối đa 50 kết quả được lưu bằng localStorage trong trình duyệt hiện tại. Đồng hồ dựa trên deadline tuyệt đối, tự nộp khi hết giờ kể cả sau khi tải lại trang. Không dùng cho kỳ thi có giám sát; đáp án có trong trình duyệt để tự học. Dữ liệu không đồng bộ giữa thiết bị, và dùng chung trong cùng hồ sơ trình duyệt. Có thể xóa ngân hàng hoặc dữ liệu trang để xóa nội dung đã nhập.

## Kiểm tra

`node --test tests/core.test.mjs`

Tài liệu: https://developers.google.com/identity/oauth2/web/guides/use-token-model và https://developers.google.com/workspace/slides/api/guides/notes
