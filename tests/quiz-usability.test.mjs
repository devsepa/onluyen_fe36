import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeExplanation} from '../dist/explanation-data.mjs';
import {createExplanationQueue} from '../dist/explanation-queue.mjs';
import {installViewportSizing} from '../dist/viewport-sizing.mjs';
const q={id:'q',sourceId:'qa',url:'',stem:'Which clause filters rows?',options:[{id:'A',text:'WHERE'},{id:'B',text:'HAVING'}],answer:'A',answerSource:'manual'};
const result={status:'answered',answer:'B',explanation:'An independent AI rationale that needs checking.',optionReasons:[{id:'A',text:'WHERE',reason:'Specific condition for A.'},{id:'B',text:'HAVING',reason:'Specific condition for B.'}]};
test('conflicting AI answer is retained only as a validated comparison and never enters ready cache or changes original data',async()=>{
 const before=structuredClone(q),values=new Map(),queue=createExplanationQueue({storage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)},load:question=>normalizeExplanation(question,result)});
 assert.equal(await queue.request(q),null);const state=queue.state(q);assert.equal(state.status,'error');assert.equal(state.code,'AI_ANSWER_CONFLICT');assert.equal(state.comparison.originalAnswer,'A');assert.equal(state.comparison.suggestedAnswer,'B');assert.equal(state.comparison.options[1].text,'HAVING');assert.deepEqual(q,before);assert.equal(values.has('sot-explanation-cache-v1'),false);queue.dispose();
});
test('malformed proposals and altered option contents are rejected without a comparison payload',()=>{
 for(const changed of [{...result,answer:'Z'},{...result,answer:'BB'},{...result,optionReasons:[result.optionReasons[0],{...result.optionReasons[1],text:'Invented text'}]}]){
  assert.throws(()=>normalizeExplanation(q,changed),error=>!error.comparison);
 }
});
test('valid explanations keep all text and memory aid; multi-answer disagreement preserves both complete sets',()=>{
 const valid=normalizeExplanation(q,{...result,answer:'A',tip:'WHERE filters rows before grouping.'});assert.equal(valid.tip,'WHERE filters rows before grouping.');assert.equal(valid.reason,result.explanation);
 const multi={...q,answer:'AC',options:'ABCD'.split('').map(id=>({id,text:'Choice '+id}))};
 assert.throws(()=>normalizeExplanation(multi,{...result,answer:'BD',optionReasons:multi.options.map(o=>({...o,reason:'Condition for '+o.id}))}),error=>error.comparison.originalAnswer==='AC'&&error.comparison.suggestedAnswer==='BD');
});
function viewportFixture(withVisual=true){
 const styles=new Map(),classes=new Set(),frames=new Map();let sequence=0;
 const win=new EventTarget();win.innerHeight=844;win.requestAnimationFrame=fn=>{frames.set(++sequence,fn);return sequence};win.cancelAnimationFrame=id=>frames.delete(id);
 if(withVisual){win.visualViewport=new EventTarget();Object.assign(win.visualViewport,{height:844,scale:1,offsetTop:0})}
 const doc=new EventTarget();doc.documentElement={style:{setProperty:(k,v)=>styles.set(k,v)},classList:{toggle:(k,on)=>on?classes.add(k):classes.delete(k)}};doc.activeElement={matches:()=>true};
 return {win,doc,styles,classes,flush(){for(const [id,fn]of frames){frames.delete(id);fn()}},frames};
}
test('visual viewport resize accommodates keyboard and offset, while pinch zoom leaves layout size stable',()=>{
 const f=viewportFixture(),dispose=installViewportSizing({window:f.win,document:f.doc});assert.equal(f.styles.get('--app-visible-height'),'844px');
 f.win.visualViewport.height=360;f.win.visualViewport.offsetTop=42;f.win.visualViewport.dispatchEvent(new Event('resize'));f.flush();assert.equal(f.styles.get('--app-visible-height'),'360px');assert.equal(f.styles.get('--app-visible-top'),'42px');assert.ok(f.classes.has('keyboard-open'));
 f.win.visualViewport.scale=2;f.win.visualViewport.dispatchEvent(new Event('resize'));f.flush();assert.equal(f.styles.get('--app-visible-height'),'844px');assert.equal(f.styles.get('--app-visible-top'),'0px');assert.ok(!f.classes.has('keyboard-open'));
 dispose();f.win.visualViewport.dispatchEvent(new Event('resize'));assert.equal(f.frames.size,0);
});
test('viewport sizing falls back to window resize when VisualViewport is unavailable',()=>{
 const f=viewportFixture(false),dispose=installViewportSizing({window:f.win,document:f.doc});f.win.innerHeight=320;f.win.dispatchEvent(new Event('resize'));f.flush();assert.equal(f.styles.get('--app-visible-height'),'320px');dispose();
});
