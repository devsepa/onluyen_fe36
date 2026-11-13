import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolveOcrLanguage} from '../dist/ocr-languages.mjs';
import {parsePresentation,normalizeSlideText} from '../dist/core.mjs';
import {cacheKey,parseWithOcr} from '../dist/ocr.mjs';
test('auto selects Japanese/Vietnamese only for JPD resources and honors explicit modes',()=>{
 for(const name of ['Sever_1_SEMESTER_3_JPD113','JPD123 notes','semester_2_jpd'])assert.equal(resolveOcrLanguage('auto',name),'jpn+vie+eng');
 assert.equal(resolveOcrLanguage('auto','SEMESTER_3_DBI202'),'eng');assert.equal(resolveOcrLanguage('eng','JPD113'),'eng');assert.equal(resolveOcrLanguage('jpn+eng','Other'),'jpn+eng');assert.throws(()=>resolveOcrLanguage('invalid'));
});
test('preserves kana, kanji and Vietnamese while accepting fullwidth choice and note labels',()=>{
 const content='Chọn chữ Hán phù hợp.\nこのかばんは［にまんよんせんはっぴゃく］えんです。\nＡ．四千八百二万\nＢ．二万四八百千\nＣ．二八百万四千\nＤ．二万四千八百';
 const shape=(id,text)=>({objectId:id,shape:{text:{textElements:[{textRun:{content:text}}]}}});
 const q=parsePresentation({slides:[{pageElements:[shape('q',content)],slideProperties:{notesPage:{notesProperties:{speakerNotesObjectId:'n'},pageElements:[shape('n','Ｄ\nにまん。2 vạn → loại A và C')]}}}]}).questions[0];
 assert.ok(q.stem.includes('このかばんは［にまんよんせんはっぴゃく］えんです。'));assert.equal(q.options[3].text,'二万四千八百');assert.deepEqual(q.options.map(o=>o.id),['A','B','C','D']);assert.equal(q.answer,'D');assert.ok(q.explanation.includes('にまん'));
 assert.equal(normalizeSlideText('ｶﾀｶﾅ Ａ ① …'),'ｶﾀｶﾅ Ａ ① …');
});
test('OCR cache is isolated by language and changing language triggers a new recognition',async()=>{
 const slide={objectId:'s',pageElements:[{image:{contentUrl:'image'}}]},p={presentationId:'p',slides:[slide]},resource={modifiedTime:'v1'},map=new Map();let reads=0;
 const settings={cache:{get:async key=>map.get(key),put:async(key,value)=>map.set(key,value)},request:async()=>({contentUrl:'image'}),recognize:async()=>{reads++;return{text:'Chọn đáp án\nこのかばん\nA. 二万\nB. 四千'}}};
 await parseWithOcr(p,resource,{...settings,language:'eng'});
 const japanese=await parseWithOcr(p,resource,{...settings,language:'jpn+vie+eng'});assert.equal(reads,2);assert.equal(japanese.questions[0].ocrLanguage,'jpn+vie+eng');
 await parseWithOcr(p,resource,{...settings,language:'jpn+vie+eng'});assert.equal(reads,2);
 assert.notEqual(await cacheKey(p,slide,resource,'eng'),await cacheKey(p,slide,resource,'jpn+vie+eng'));
});
