const messages={
 GOOGLE_SIGN_IN:['Phiên kết nối Google đã hết hạn hoặc chưa có.','Mở ảnh đại diện, kết nối lại Google rồi thử lại đúng slide này.'],
 GOOGLE_FORBIDDEN:['Tài khoản hiện tại chưa có quyền đọc tài liệu hoặc ảnh.','Mở link gốc bằng đúng tài khoản có quyền xem; kiểm tra quyền chia sẻ rồi tải lại.'],
 GOOGLE_NOT_FOUND:['Không tìm thấy tài liệu/slide trong phạm vi quyền truy cập hiện tại.','Kiểm tra link và số slide gốc. Tài liệu có thể đã đổi, bị xóa hoặc không còn được chia sẻ.'],
 SHARED_NOT_FOUND:['Bộ đề hoặc ảnh không còn có trong kho cộng đồng.','Thử tải lại danh sách kho; dùng bản offline/sao lưu nếu bộ đề đã bị gỡ.'],
 SHARED_ACCESS_DENIED:['Máy chủ kho cộng đồng từ chối quyền truy cập hiện tại.','Mở đúng địa chỉ website và thử lại; nếu còn lỗi, gửi mã này cho người quản lý web.'],
 SHARED_SERVICE_UNAVAILABLE:['Máy chủ kho cộng đồng chưa xử lý được yêu cầu.','Thử tải lại sau; các bộ đề đã lưu trên thiết bị vẫn được giữ.'],
 GOOGLE_SERVICE_UNAVAILABLE:['Google chưa xử lý được yêu cầu đọc tài liệu hoặc ảnh.','Thử lại sau; giữ nguyên dữ liệu đã nhập, không cần đăng nhập lại chỉ vì lỗi máy chủ.'],
 GOOGLE_REQUEST_INVALID:['Google không chấp nhận yêu cầu đọc tài liệu/ảnh.','Kiểm tra link tài liệu rồi thử lại. Nếu lặp lại, gửi tên tài liệu, slide và mã lỗi cho người quản lý web.'],
 AI_QUEUE_BUSY:['AI đang bận xếp hàng, chưa xác định là hết hạn mức.','Chờ ít giây rồi thử lại câu này; không cần đăng nhập lại.'],
 AI_RATE_LIMITED:['Máy chủ AI đang giới hạn lượt xử lý dùng chung, không khẳng định bạn đã hết lượt cá nhân.','Chờ thời gian hiển thị rồi thử lại. Khôi phục có thể lâu hơn; bạn vẫn học tiếp bằng đáp án đã lưu. Không cần đăng nhập lại.'],
 GOOGLE_RATE_LIMITED:['Google đang giới hạn lượt đọc tài liệu/ảnh.','Chờ đợt tải hiện tại hoặc dừng và thử lại sau; không bấm tải lặp nhiều lần.'],
 AI_TIMEOUT:['AI chưa phản hồi trong thời gian chờ.','Làm tiếp câu khác rồi thử lại giải thích cho câu này.'],
 NETWORK_UNREACHABLE:['Không nhận được phản hồi mạng; chưa xác định do mất mạng, chặn truy cập hay máy chủ.','Kiểm tra kết nối, thử mở link gốc rồi tải lại. Nếu vẫn lỗi, gửi mã lỗi và vị trí bên dưới.'],
 IMAGE_INVALID:['Dữ liệu nhận được không hiển thị được thành ảnh hợp lệ.','Thử tải lại ảnh hoặc mở slide gốc để kiểm tra; dùng ảnh PNG/JPEG/WebP rõ nét nếu nhập từ file.'],
 IMAGE_TOO_LARGE:['Ảnh vượt kích thước dịch vụ có thể xử lý.','Dùng ảnh nhỏ hơn hoặc tải lại ảnh slide gốc; không cần sửa đáp án đã lưu.'],
 AI_RESPONSE_INVALID:['Phản hồi AI chưa đủ hoặc không hợp lệ để lưu kết quả.','Đối chiếu ảnh và đủ lựa chọn A–H rồi thử lại; web không tự điền phần còn thiếu.'],
 AI_ANSWER_CONFLICT:['Đáp án AI khác đáp án gốc đang lưu.','Mở ảnh gốc và đối chiếu các lựa chọn trước khi sửa hoặc duyệt; đáp án gốc vẫn được giữ để chấm bài.'],
 AI_SERVICE_UNAVAILABLE:['Dịch vụ AI chưa xử lý được yêu cầu.','Thử lại sau. Nếu lặp lại, gửi mã lỗi cho người quản lý web; không cần cấu hình gì trên máy bạn.'],
 AI_CONFIGURATION:['Máy chủ AI đang gặp vấn đề truy cập hoặc cấu hình.','Gửi mã lỗi cho người quản lý web. Bạn không cần đổi tài khoản Google hay nhập khóa API.'],
 STORAGE_FULL:['Trình duyệt chưa lưu được dữ liệu trên thiết bị.','Sao lưu dữ liệu hiện có, kiểm tra dung lượng/quyền lưu trữ rồi thử lại. Không xóa dữ liệu học khi chưa sao lưu.'],
 STORAGE_UNAVAILABLE:['Trình duyệt đang chặn quyền lưu dữ liệu của website.','Kiểm tra quyền lưu trữ/chế độ riêng tư của trình duyệt. Giữ nội dung đang nhập và sao lưu trước khi đóng trang.'],
 UNKNOWN_ERROR:['Thao tác chưa hoàn tất; chưa xác định được nguyên nhân cụ thể.','Thử lại. Nếu còn lỗi, gửi mã lỗi cùng tài liệu/số slide bên dưới để kiểm tra.']
};
export function describeUserError(error={},context={}){
 const service=context.service||error.service||'',status=Number(error.status)||0;
 let code=error.code;
 if(code==='AI_IMAGE_INVALID'||code==='IMAGE_DECODE_FAILED')code='IMAGE_INVALID';
 if(['AI_KEY_INVALID','AI_PROJECT_RESTRICTED','AI_REGION_UNSUPPORTED','AI_CONFIG_UNSUPPORTED','AI_REQUEST_INVALID'].includes(code))code='AI_CONFIGURATION';
 if(!messages[code]){
  if(error.name==='QuotaExceededError')code='STORAGE_FULL';
  else if(error.name==='SecurityError')code='STORAGE_UNAVAILABLE';
  else if(error.name==='EncodingError')code='IMAGE_INVALID';
  else if(error.name==='TimeoutError'||status===504)code=service==='AI'?'AI_TIMEOUT':'NETWORK_UNREACHABLE';
  else if(status===401)code=service==='AI'?'AI_CONFIGURATION':'GOOGLE_SIGN_IN';
  else if(status===403)code=service==='AI'?'AI_CONFIGURATION':service==='Kho cộng đồng'?'SHARED_ACCESS_DENIED':'GOOGLE_FORBIDDEN';
  else if(status===404)code=service==='Kho cộng đồng'?'SHARED_NOT_FOUND':'GOOGLE_NOT_FOUND';
  else if(status===429)code=service==='Google'?'GOOGLE_RATE_LIMITED':'AI_RATE_LIMITED';
  else if(status===413)code='IMAGE_TOO_LARGE';
  else if(status===502&&service==='AI')code='AI_RESPONSE_INVALID';
  else if(status>=500&&service==='AI')code='AI_SERVICE_UNAVAILABLE';
  else if(status>=500&&service==='Google')code='GOOGLE_SERVICE_UNAVAILABLE';
  else if(status>=500&&service==='Kho cộng đồng')code='SHARED_SERVICE_UNAVAILABLE';
  else if(status===400&&service==='Google')code='GOOGLE_REQUEST_INVALID';
  else if(error.name==='TypeError'||error.name==='NetworkError')code='NETWORK_UNREACHABLE';
  else code='UNKNOWN_ERROR';
 }
 const [cause,action]=messages[code],location=[context.operation,context.sourceName,Number.isInteger(context.slide)?`Slide ${context.slide}`:null].filter(Boolean).join(' · ');
 const aliases=['AI_IMAGE_INVALID','IMAGE_DECODE_FAILED','AI_KEY_INVALID','AI_PROJECT_RESTRICTED','AI_REGION_UNSUPPORTED','AI_CONFIG_UNSUPPORTED','AI_REQUEST_INVALID'];
 const referenceCode=aliases.includes(error.code)?error.code:code,reference=`${referenceCode}${status?' · HTTP '+status:''}`;
 return {code:referenceCode,status,location,cause,action,text:[location,cause,action,`Mã lỗi: ${reference}`].filter(Boolean).join('\n')};
}
export function contextualError(error,context){
 if(error?.name==='AbortError')return error;
 const description=describeUserError(error,context),wrapped=Object.assign(new Error(description.text),{status:error.status,code:description.code,retryAfterSeconds:error.retryAfterSeconds,service:context.service,ocrFatal:error.ocrFatal});
 if(error.comparison)wrapped.comparison=error.comparison;
 return wrapped;
}
