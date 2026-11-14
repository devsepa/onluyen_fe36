export const RATE_LIMIT_MESSAGE='AI đang tạm hết lượt xử lý. Bạn vẫn có thể làm tiếp và xem giải thích đã lưu trên thiết bị. Không cần đăng nhập lại.';
export function aiRateLimitError(response,now=Date.now()){
 const header=response.headers.get('Retry-After');
 const seconds=header&&/^\d+(?:\.\d+)?$/.test(header)?Number(header):header?(Date.parse(header)-now)/1000:60;
 const retryAfterSeconds=Math.min(86400,Math.max(1,Math.ceil(Number.isFinite(seconds)?seconds:60)));
 return Object.assign(Error(RATE_LIMIT_MESSAGE),{status:429,code:'AI_RATE_LIMITED',retryAfterSeconds});
}
