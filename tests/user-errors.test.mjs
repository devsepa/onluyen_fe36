import test from 'node:test';
import assert from 'node:assert/strict';
import {describeUserError,contextualError} from '../dist/user-errors.mjs';
test('image errors identify operation document slide HTTP status and targeted recovery',()=>{
 const context={service:'Google',operation:'Tải ảnh',sourceName:'JPD113',slide:235};
 const forbidden=describeUserError({status:403},context);assert.equal(forbidden.code,'GOOGLE_FORBIDDEN');for(const part of ['JPD113','Slide 235','HTTP 403','quyền'])assert.ok(forbidden.text.includes(part));
 assert.equal(describeUserError({status:404},context).code,'GOOGLE_NOT_FOUND');assert.equal(describeUserError({status:404},{service:'Kho cộng đồng'}).code,'SHARED_NOT_FOUND');assert.equal(describeUserError({status:503},context).code,'GOOGLE_SERVICE_UNAVAILABLE');
});
test('network errors never guess expired login or expose raw request diagnostics',()=>{
 const detail=describeUserError(Object.assign(new TypeError('fetch failed Bearer private-token https://example/?key=secret'),{code:'RAW_UNTRUSTED_CODE'}),{operation:'Đọc slide',sourceName:'DBI202',slide:4});
 assert.equal(detail.code,'NETWORK_UNREACHABLE');assert.ok(detail.text.includes('chưa xác định'));assert.ok(!detail.text.includes('private-token'));assert.ok(!detail.text.includes('key=secret'));assert.ok(!detail.text.includes('đăng nhập lại'));
 const unknown=describeUserError(Error('private stack'));assert.equal(unknown.code,'UNKNOWN_ERROR');assert.ok(!unknown.text.includes('private stack'));
});
test('queue busy and provider quota stay distinct with retry metadata and image control codes preserved',()=>{
 const busy=contextualError({status:503,code:'AI_QUEUE_BUSY',retryAfterSeconds:15},{service:'AI',operation:'Giải thích',slide:2});assert.equal(busy.code,'AI_QUEUE_BUSY');assert.equal(busy.retryAfterSeconds,15);assert.ok(busy.message.includes('chưa xác định là hết hạn mức'));
 const quota=describeUserError({status:429},{service:'AI'});assert.equal(quota.code,'AI_RATE_LIMITED');assert.ok(quota.text.includes('dùng chung'));
 const image=contextualError({status:400,code:'AI_IMAGE_INVALID'},{service:'AI'});assert.equal(image.code,'AI_IMAGE_INVALID');assert.ok(image.message.includes('AI_IMAGE_INVALID'));
 const abort=new DOMException('Stopped','AbortError');assert.equal(contextualError(abort,{}),abort);
});
test('storage quota and blocked permission have distinct actions; answer conflict metadata survives',()=>{
 assert.equal(describeUserError({name:'QuotaExceededError'}).code,'STORAGE_FULL');assert.equal(describeUserError({name:'SecurityError'}).code,'STORAGE_UNAVAILABLE');
 const comparison={suggestedAnswer:'AE'},error=contextualError({code:'AI_ANSWER_CONFLICT',comparison},{service:'AI',slide:3});assert.equal(error.code,'AI_ANSWER_CONFLICT');assert.equal(error.comparison,comparison);
});
