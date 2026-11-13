# Slide Ôn Thi

Ứng dụng tĩnh, không cần build. Phục vụ thư mục `dist` qua HTTP, không mở trực tiếp bằng file://.

Xuất bản GitHub Pages: xem [hướng dẫn triển khai](docs/github-pages.md). Workflow đã chuẩn bị ở `.github/workflows/pages.yml`; chỉ upload `dist/`, chạy kiểm tra trước khi deploy. Backend/kho dùng chung chưa được triển khai.

Toàn bộ dự án nằm trong folder `slide-on-thi`. Với Node.js đã cài, chạy `npm start` trong folder rồi mở http://localhost:8080. Không cần cài dependency. Chạy `npm test` để kiểm tra logic.

## Cấu hình Google

1. Tạo Google Cloud project và bật Google Slides API cùng Google Drive API.
2. Cấu hình Google Auth Platform: branding, audience và hai scope `https://www.googleapis.com/auth/presentations.readonly`, `https://www.googleapis.com/auth/drive.metadata.readonly`. Khi ở Testing, thêm Gmail được phép xem tài liệu vào Test users. Nếu đã kết nối bản trước, cần kết nối lại để cấp thêm quyền tìm file.
3. Tạo OAuth Client ID loại Web application. Thêm origin của web vào Authorized JavaScript origins (không có path). Với local có thể dùng http://localhost:8080.
4. Chủ web cấu hình `GOOGLE_CLIENT_ID` trong `dist/site-config.mjs` một lần khi triển khai. Client ID là thông tin công khai; không đặt Client Secret vào frontend. Cấu hình dùng chung được ưu tiên hơn dữ liệu cũ trong trình duyệt. Khách không có trang/nút nhập Client ID hoặc hướng dẫn thiết lập kỹ thuật.
5. Kết nối Google bằng đúng tài khoản có quyền xem slide. Web tự tìm file theo mẫu tên, hiện các kết quả phù hợp nhưng mặc định không chọn nguồn nào. Người dùng tích chọn nguồn muốn ôn rồi bấm Dùng tài liệu đã chọn.

## Chọn nguồn tài liệu

Web dùng Drive API để liệt kê metadata của Google Slides (cả tài liệu được chia sẻ có trong kết quả của tài khoản), duyệt đủ phân trang rồi lọc tên không phân biệt hoa/thường: SEMESTER, SEMETER, Sever kèm số, cho phép dấu cách, dấu gạch dưới, dấu gạch ngang. Ví dụ `SEMESTER_2_MAD101`, `SEMETER_2`, `Sever_2_SEMESTER_1_CSI`. Quy tắc ở `dist/resources.mjs`.

Chỉ đọc nội dung những tài liệu trong danh sách đã chọn, không đọc nội dung các file khác. Nếu không có kết quả phù hợp, người dùng bấm Chọn tài liệu khác để chọn một hoặc nhiều Google Slides bằng tên, hoặc dán link. Khi nhập, ngân hàng được thay bằng câu hỏi từ các nguồn đã chọn; lịch sử cũ giữ nguyên. Câu hỏi ghi nguồn (file ID, tên và trang slide). Tài liệu không đọc được hoặc slide không nhận diện được đều được báo; lỗi một phần phải được người dùng đồng ý trước khi thay ngân hàng.

Không còn bộ câu hỏi mẫu hoặc nội dung ngoài nguồn do người dùng chọn. Đây là bộ lọc trong ứng dụng; Google không cung cấp scope OAuth giới hạn theo mẫu tên file. `drive.metadata.readonly` là quyền metadata rộng và thuộc nhóm Restricted của Google: khi đưa ứng dụng cho nhiều người dùng phải xem yêu cầu xác minh tương ứng. Chế độ Testing dùng các tài khoản test đã cấu hình. Nội dung chỉ gọi trực tiếp Google API trong trình duyệt, không chuyển qua máy chủ của ứng dụng.

Chỉ hỗ trợ Google Slides native. File `.ppt`/`.pptx` cần được chuyển thành Google Slides trước khi dùng. Không tự chuyển file hoặc tạo bản sao.

## OCR cho slide dạng ảnh

Sau khi đọc chữ native, tự OCR các trang có ảnh chưa nhận diện được câu hỏi. Với trang chỉ có một ảnh không bị crop, đọc ảnh gốc trực tiếp từ Google để tránh tạo thumbnail từng trang. Bố cục nhiều thành phần dùng Google Slides getThumbnail LARGE. Dùng Tesseract.js 6.0.1 với hai worker trên máy phù hợp, một worker trên máy ít bộ nhớ/ít nhân. Tiếng Anh là mặc định; có thể chọn Anh + Việt. Không cần API key dịch vụ AI, không gửi ảnh qua máy chủ OCR. Lần đầu tải mã OCR/WASM và dữ liệu ngôn ngữ từ CDN. Chỉ gửi access token tới Google API; URL ảnh có chữ ký chỉ dùng để tải ảnh Google, không lưu vào cache hoặc gửi sang dịch vụ khác.

Mặc định lấy nhanh 30 câu / tài liệu thay vì bắt người học chờ hết bộ slide. Có thể chọn 60/100 câu hoặc Đọc toàn bộ, khoảng trang cần nhập và ngôn ngữ phù hợp. Nút Dùng ngay các câu đã đọc sẽ hoàn tất các tác vụ đang chạy rồi nhập phần đã có, không cần đợi các trang còn lại. Nút Dừng nhập hủy và giữ ngân hàng trước. Kết quả luôn theo thứ tự trang dù OCR hoàn tất khác thứ tự.

Ngân hàng đã kiểm tra có thể xuất thành JSON và nhập lại để dùng ngay. File lưu nội dung, đáp án và nguồn slide; không chứa cấu hình Google, access token hoặc URL ảnh có chữ ký. File do người dùng chủ động tải về và chọn nhập. Ngân hàng nhập phải có nguồn Google Slides hợp lệ; chưa có hệ thống chia sẻ hoặc cache chung giữa nhiều người dùng. Muốn phục vụ ngay cho nhiều thiết bị cần triển khai xử lý một lần ở máy chủ và lưu ngân hàng theo nguồn/quyền truy cập.

Giới hạn nhịp yêu cầu thumbnail, thử lại khi Google trả 429/5xx. Hiển thị slide đang đọc, số trang đã xử lý và số câu đã nhận diện. Có nút Dừng nhập. OCR text/confidence được lưu trong IndexedDB theo file, trang, thời điểm sửa và cấu trúc slide; nguồn sửa sẽ đọc lại. Nếu thiếu version/thời điểm sửa hoặc IndexedDB không khả dụng thì không tái sử dụng cache bền vững. Có thể xóa toàn bộ dữ liệu trang trong trình duyệt để xóa cache này.

Giữ đáp án từ speaker notes của trang gốc; đáp án đơn rõ ràng được dùng ngay cho cả chữ và OCR, không cần xác nhận từng câu. Nút “Lấy đáp án từ ghi chú” cập nhật toàn bộ câu chưa xác nhận trong ngân hàng đã lưu bằng slide object ID, không OCR lại và không thay đáp án đã xác nhận. Câu thiếu ghi chú, ghi chú mơ hồ hoặc nhiều đáp án vẫn cần kiểm tra. Giữ liên kết về slide gốc. Không đảm bảo OCR chính xác với ảnh mờ, bố cục phức tạp hoặc một ảnh có nhiều câu hỏi.

Google Identity Services token model; token chỉ tồn tại trong bộ nhớ và được cấp lại bằng thao tác người dùng khi hết hạn. Ứng dụng gọi Google Slides API trực tiếp. Không chuyển token hoặc tài liệu tới backend/AI. OAuth chỉ cấp quyền đọc Slides, không tạo một tài khoản ứng dụng riêng.

## Phạm vi

## Hai chế độ làm bài

- **Ôn luyện:** chấm ngay sau khi chọn mỗi câu, hiện đúng/sai và đáp án đúng. Khóa đáp án sau lần chọn đầu để giữ điểm thực tế. Không giới hạn thời gian; hiển thị thời gian đã học và số câu đúng. Có thể kết thúc bất cứ lúc nào và luyện lại câu sai.
- **Thi thử:** chọn số câu và thời gian thi. Các lựa chọn giữ nguyên thứ tự A/B/C/D theo slide, hiển thị một cột dọc. Được thay đổi lựa chọn, đánh dấu câu cần xem lại. Không hiện đúng/sai hoặc điểm trong khi làm. Tự nộp khi hết giờ, chỉ xem điểm và đáp án sau khi nộp. Ẩn ngân hàng câu hỏi trong khi thi.

Cả hai chế độ giữ bài đang làm sau khi tải lại trang; lịch sử ghi rõ chế độ. Bài đang làm từ phiên bản trước được coi là Thi thử.

## Giao diện và kiểm tra trình duyệt

Avatar góc phải có menu đăng nhập Google, hiển thị tên/email/ảnh đại diện khi đã kết nối, đổi tài khoản và đăng xuất. Dùng UserInfo với quyền `openid`, `userinfo.profile`, `userinfo.email` cùng các quyền đọc tài liệu. Chỉ giữ token và profile trong bộ nhớ phiên, không lưu access token vào localStorage. Đây là trạng thái kết nối Google trong trình duyệt; chưa phải tài khoản backend hoặc đồng bộ dữ liệu theo Gmail. Đăng xuất ngắt quyền Google nhưng giữ ngân hàng đã lưu trên thiết bị.

Mỗi tab chỉ hiển thị nội dung nhiệm vụ của nó: Tài liệu chọn nguồn/nhập; Ngân hàng kiểm tra/sửa/xác nhận và nhập xuất bộ câu hỏi; Ôn luyện & Thi thử thiết lập/làm bài; Lịch sử xem bài đã nộp. Kết quả có màn hình riêng, giữ mục Lịch sử đang chọn. Không lặp hero chào mừng hoặc ba thẻ thống kê trên mọi trang. Số câu chỉ nằm trong ngân hàng, số bài và điểm chỉ nằm trong lịch sử/kết quả. Thông báo OCR chỉ hiển thị ở Tài liệu; nhập xong không tự chuyển tab, có nút để người dùng chủ động mở ngân hàng.

Bảng màu dùng xanh tím trên nền trắng xanh nhạt (light) và xanh đêm (dark), với màu riêng cho đúng/sai/cảnh báo. Mặc định light khi chưa chọn theme; lựa chọn trước đó được giữ lại. `AGENTS.md` yêu cầu mọi lần thay đổi giao diện phải đối chiếu PC/mobile và cả hai theme. Chạy `scripts/theme-qa.mjs` trong browser QA riêng để kiểm tra bốn trang ở 1440/768/390/320 px, giới hạn dialog, lưu theme và tương phản chữ; ảnh chụp ở `outputs/themes/`.

Gồm bốn trang: Tài liệu của tôi, Ngân hàng câu hỏi (lọc nguồn/tìm kiếm/phân trang/sửa bằng modal/xác nhận), Ôn luyện & Thi thử (điều hướng từng câu và bảng câu hỏi), Lịch sử & Kết quả (điểm, lọc câu sai, luyện lại). Có giao diện sáng/tối và bố cục điện thoại. Giữ tương thích dữ liệu localStorage và OAuth Client ID từ các bản trước.

`scripts/browser-qa.mjs` kiểm tra qua Chrome DevTools Protocol của browser QA riêng trên cổng 9223, web local cổng 8080. Script dùng dữ liệu kiểm thử trong profile riêng và chụp ảnh vào `outputs/`, không dùng profile Gmail của người dùng. `scripts/browser-ocr-qa.mjs` kiểm tra OCR thật trên 4 ảnh câu hỏi được vẽ bằng canvas, xác nhận không gọi thumbnail cho ảnh đơn. Các bài này không thay thế kiểm tra tài liệu private thực tế.

## Nội dung tài liệu

Trích câu hỏi có lựa chọn A. B. C. D., A) B), (A), [A], xuống dòng hoặc cùng dòng; hỗ trợ shape, group và table, OCR cho trang dạng ảnh. Đáp án đơn lấy từ speaker notes dạng `A`, `Answer: A` hoặc `Đáp án: A` và tự sẵn sàng để luyện. Báo các slide bị bỏ qua. Chưa tự sinh câu mới bằng AI. Câu nhiều đáp án được hỗ trợ như mô tả bên dưới.

Câu hỏi, Client ID, bài đang làm và tối đa 50 kết quả được lưu bằng localStorage trong trình duyệt hiện tại. Đồng hồ dựa trên deadline tuyệt đối, tự nộp khi hết giờ kể cả sau khi tải lại trang. Không dùng cho kỳ thi có giám sát; đáp án có trong trình duyệt để tự học. Dữ liệu không đồng bộ giữa thiết bị, và dùng chung trong cùng hồ sơ trình duyệt. Có thể xóa ngân hàng hoặc dữ liệu trang để xóa nội dung đã nhập.

## Kiểm tra

`npm test` hoặc `node --test tests/*.test.mjs`

Tài liệu: https://developers.google.com/identity/oauth2/web/guides/use-token-model và https://developers.google.com/workspace/slides/api/guides/notes

Nội dung câu hỏi lọc riêng watermark “Hoàng Hoàng Buôn Source” (kể cả một số biến thể OCR có/không dấu). Áp dụng khi đọc slide, dùng lại cache OCR, nhập bộ JSON và tải lại ngân hàng/bài làm cũ; giữ nguyên nguồn slide, đáp án theo ID và kết quả chấm. Các từ “source” khác trong kiến thức vẫn được giữ.

Nhập slide theo từng nhóm liên tiếp và ghép kết quả đúng thứ tự gốc, kể cả khi xen kẽ chữ và ảnh. Giới hạn số câu không ưu tiên câu chữ ở cuối tài liệu. Chi tiết nhập phân biệt trang đã đọc nhưng chưa nhận diện câu hỏi với trang chưa đọc do giới hạn/dừng sớm; mỗi trang chưa nhận diện có liên kết đến slide gốc. Có thể dùng khoảng slide để thử đọc lại.

Google connection: short-lived access token, its actual expiry and basic profile are kept in sessionStorage for this tab, so reload reuses a valid grant. They are removed on logout, expiry or HTTP 401; no refresh token or client secret is stored. No automatic login popup occurs on page load. Reconnecting uses Google's default prompt; explicit account switching uses select_account. Saved quizzes and history work without Google access. Notes refresh reports zero updates accurately and distinguishes missing slide IDs, empty returned speaker notes and unmatched answers. Unique BODY-placeholder fallback and invisible direction marks are supported without reading unrelated note-page elements. Browser QA covers reload restoration and logout cleanup with mocked Google APIs; private production slides have not been directly inspected.

Speaker notes may start with a single answer letter on the first nonempty line followed by translations and explanations. The answer comes only from that leading line; contradictory standalone answer lines remain unverified. Explanation text is kept separately, included in bank exports/imports, and shown after answering in study mode or after submission in results. Existing unverified banks can use the notes-refresh action without OCR.
## Gemini answer suggestions

The library now includes optional batch AI suggestions, stop/resume with saved results, explicit bulk acceptance, and separate AI provenance. Only unanswered questions are sent; existing answers are preserved. Gemini API key is never configured in the browser. The Cloudflare Worker and GitHub deployment workflow are ready in `backend/` and `.github/workflows/ai-backend.yml`. See [backend setup](backend/README.md) for account/secrets setup and the public `AI_API_BASE` repository Variable. Until that is configured, the public website shows that AI is being prepared; live Gemini has not been tested without an owner's key. Server quota defaults: 150 questions per user/day, 1000 globally/day, 5 per request. Local answers remain local, not a shared repository.

`node scripts/browser-ai-qa.mjs` uses synthetic questions, a mocked Gemini endpoint and an isolated Chrome QA profile. It verifies batches, source-answer preservation, unverified proposals, bulk acceptance, reload, stop/resume, Google-session gating and PC/mobile light/dark/narrow layouts. It does not call Gemini or overwrite a visitor's browser storage.
### English slide content cleanup

Questions retain the original English stem and ordered choices. Speaker-note explanations are stored separately from the original stem/options and shown only after grading; they are preserved across bank reloads, active sessions, history and exports. The complete repeated-name branding signature is matched with bounded OCR tolerance (including Buén Sourge and S0urce); standalone FORU/LEARN TO KNOW logo lines are removed. Ordinary uses of source, SQL syntax and quoted literals are preserved. Optional AI proposals keep their distinct explanation/provenance separately.
### Multiple correct answers

Speaker notes such as `AD`, `ACE`, `ABC`, `A, D` or `Đáp án: ACE` are accepted on the first line, including when explanation text follows. All letters must exist among the slide choices. The stored answer is a canonical set of letters; displayed choices retain original A/B/C/D/E order. Existing unanswered imports can read notes again without OCR. Single-answer study feedback remains immediate. Multi-answer study questions allow toggling choices and require **Kiểm tra đáp án** before grading/locking; mock exams allow changing selections until submission/deadline. Only an exact full set earns a point. Draft selections survive reload; results highlight every correct/incorrect choice. Library/editor answer inputs accept concatenated letters, and exported/imported banks retain them. AI answer generation remains limited to single-choice proposals and leaves uncertain/multiple-answer generation for review.

`node scripts/browser-multi-qa.mjs` verifies multi-answer entry, draft reload, explicit checking, exact-set grading, extra-choice errors, retry, option order and desktop/mobile light/dark/narrow layouts with synthetic local data.
### Original-image comparison and transcription fidelity

OCR questions provide **Đối chiếu ảnh gốc** in the library and active quiz. A dialog fetches a fresh Google-rendered thumbnail of the original slide on demand, with fit-to-screen and 100% views. It requires the existing Google read permission; it never opens a new login popup automatically. OAuth tokens are used only for the Slides API request, not forwarded to image hosts. Blob URLs are revoked on close and images are not persisted. The original image is evidence, not an AI reconstruction; original branding is visible only in this explicit comparison view.

Speaker-note answer badges now say **Đáp án từ ghi chú** so an answer's provenance is not mistaken for proof of perfect OCR. Source SQL placeholders/operators are escaped for HTML rendering and preserved verbatim; the app does not guess whether a `<parameter=` should be `<parameter>`, because a distractor can intentionally have incorrect syntax. Correcting existing transcription mistakes requires comparison with the actual source and editing. OCR/AI cannot guarantee character-perfect text. Browser QA covers image retrieval, fit/100% controls, desktop/mobile light/dark dialog bounds, releasing images and preserving the Google session using mock APIs; no private source slide was inspected by the agent.

Notes explanations: a leading answer or answer set is separated from the remaining speaker notes. Existing verified questions lacking explanations can refresh notes without OCR; existing confirmed answers are never changed when the note answer disagrees. Study shows the saved explanation after grading regardless of correctness, including multi-answer checks. Exams hide it until submission and then show it in review for all questions. Empty notes do not cause an explanation to be invented.
