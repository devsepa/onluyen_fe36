import test from 'node:test';
import assert from 'node:assert/strict';
import {parseConfig} from '../scripts/read-config.mjs';
test('deployment configuration accepts plain UTF-8 and Windows BOM without altering Unicode values',()=>{for(const prefix of ['','\uFEFF'])assert.deepEqual(parseConfig(prefix+'{"name":"Ôn luyện","vars":{"GEMINI_MODEL":"test"}}'),{name:'Ôn luyện',vars:{GEMINI_MODEL:'test'}})});
test('malformed configuration remains an error',()=>assert.throws(()=>parseConfig('\uFEFF{invalid}')));
