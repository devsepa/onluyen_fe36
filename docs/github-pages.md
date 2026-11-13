# Xuất bản GitHub Pages

Repository đích: `devsepa/onluyen_fe36`. URL dự kiến: `https://devsepa.github.io/onluyen_fe36/`. Chỉ xác nhận website hoạt động sau khi workflow triển khai thành công và URL trả về trang web.

Website hiện tại là HTML/CSS/JavaScript tĩnh trong `dist/`. Workflow `.github/workflows/pages.yml` kiểm tra cú pháp, chạy test rồi chỉ xuất bản thư mục `dist`; không xuất bản profile browser QA, ảnh chụp trong `outputs/`, file môi trường hoặc dữ liệu tài liệu riêng tư.

1. Tạo repository GitHub cho dự án; với GitHub Free, dùng repository public để có GitHub Pages.
2. Push mã nguồn lên nhánh `main` của repository đã chọn.
3. Repository → Settings → Pages → Build and deployment → Source: **GitHub Actions**.
4. Chạy workflow **Publish GitHub Pages** trong Actions (hoặc push thay đổi vào `dist/`). Đợi deployment thành công; URL thật được hiển thị trong workflow và Settings → Pages.
5. URL dạng `https://<owner>.github.io/<repository>/`. Không dùng đây như bằng chứng đã publish cho tới khi workflow thực sự thành công.
6. Trong Google Auth Platform → Clients → OAuth Web client của ứng dụng, thêm **Authorized JavaScript origin** `https://<owner>.github.io` (không thêm đường dẫn repository). Giữ các origin localhost nếu vẫn phát triển local.

Client ID trong `dist/site-config.mjs` là thông tin công khai của ứng dụng. Không đặt Client Secret, access token hay khóa quản trị database trong repo hoặc frontend. Backend sau này chỉ có thể dùng khóa công khai với quyền dữ liệu được kiểm soát; khóa service role phải ở server.

Ứng dụng Google OAuth ở Testing chỉ cho các Test users đã thêm. Việc GitHub Pages public không thay đổi đối tượng Google được phép đăng nhập. Để mở cho người dùng bên ngoài danh sách test cần cấu hình audience/production và hoàn thành xác minh các scope khi Google yêu cầu.

## Backend cho kho chung

GitHub Pages chỉ phục vụ giao diện tĩnh, không chạy server hay database. Phương án khởi đầu: Pages cho giao diện; Supabase Auth + Postgres cho tài khoản, bộ câu hỏi, tài nguyên và bài làm. Người đóng góp có thể dùng OCR hiện tại trên trình duyệt rồi chủ động gửi bộ đề để duyệt; những người sau đọc bộ đã duyệt từ database. Như vậy chưa cần server OCR riêng hoặc API AI có phí.

Nếu cần upload và đóng trình duyệt vẫn xử lý tiếp thì bổ sung queue và OCR worker riêng. Đây là phần triển khai phức tạp/tốn tài nguyên hơn và chưa được thêm vào dự án hiện tại.

Nguồn riêng tư và bộ công khai phải tách quyền truy cập. Cần đăng nhập được xác minh trên backend, RLS cho dữ liệu cá nhân, quyền đóng góp/duyệt và lưu phiên bản bộ câu hỏi. Avatar Google hiện tại không thay thế xác thực backend.
