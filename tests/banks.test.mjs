import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateBank} from '../dist/banks.mjs';
const question=()=>({id:'original',stem:'Question?',options:[{id:'A',text:'One'},{id:'B',text:'Two'}],answer:'B',verified:true,sourceId:'source123',sourceName:'SEMESTER_2',slide:3,url:'https://docs.google.com/presentation/d/source123/edit#slide=id.s3',token:'must not be imported'});
test('saved banks retain source and grading but do not import unrelated fields',()=>{
 const result=validateBank({format:'slide-on-thi/v1',questions:[question()]});assert.equal(result[0].answer,'B');assert.equal(result[0].verified,true);assert.equal(result[0].sourceId,'source123');assert.equal(result[0].token,undefined);assert.notEqual(result[0].id,'original');
});
test('rejects external sources and duplicate answer labels',()=>{
 assert.throws(()=>validateBank({format:'slide-on-thi/v1',questions:[{...question(),url:'https://example.com'}]}));
 assert.throws(()=>validateBank({format:'slide-on-thi/v1',questions:[{...question(),options:[{id:'A',text:'One'},{id:'A',text:'Two'}]}]}));
});
test('missing answers cannot be marked as verified after import',()=>{
 const result=validateBank({format:'slide-on-thi/v1',questions:[{...question(),answer:'D'}]});assert.equal(result[0].verified,false);assert.equal(result[0].answer,'');
});
