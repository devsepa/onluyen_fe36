import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupAmbientBackground } from '../dist/ambient-background.mjs';

test('ambient background module exports setupAmbientBackground function', () => {
  assert.equal(typeof setupAmbientBackground, 'function');
});

test('setupAmbientBackground is completely safe in non-browser environment', () => {
  assert.doesNotThrow(() => {
    const res = setupAmbientBackground();
    assert.equal(res, undefined);
  });
});

test('mobile/economy/reduced-motion and active quizzes do not schedule background frames',()=>{
 for(const mode of ['mobile','economy','reduced','quiz','desktop']){
  const frames=new Map(),attrs=new Map();let id=0;
  const ctx={clearRect(){},save(){},restore(){},beginPath(){},arc(){},fill(){}};
  const canvas={getContext:()=>ctx};
  globalThis.document={getElementById:id=>id==='stardustCanvas'?canvas:{},documentElement:{classList:{contains:name=>mode==='economy'&&name==='economy-mode'},setAttribute:(k,v)=>attrs.set(k,v)},body:{classList:{contains:()=>mode==='quiz'}},hidden:false,addEventListener(){}};
  globalThis.window={innerWidth:mode==='mobile'?390:1440,innerHeight:844,matchMedia:query=>({matches:query.includes('reduced-motion')?mode==='reduced':mode==='mobile'}),addEventListener(){},requestAnimationFrame:fn=>{frames.set(++id,fn);return id},cancelAnimationFrame:id=>frames.delete(id)};
  globalThis.MutationObserver=class{observe(){}};
  try{const controls=setupAmbientBackground();assert.equal(frames.size,mode==='desktop'?1:0,mode);assert.equal(attrs.get('data-background-motion'),mode==='desktop'?'on':'off');controls.start();assert.equal(frames.size,mode==='desktop'?1:0);controls.stop()}finally{delete globalThis.document;delete globalThis.window;delete globalThis.MutationObserver}
 }
});

test('setupAmbientBackground initializes cleanly with mock DOM', () => {
  const listeners = new Map();
  const mockCanvas = {
    getContext: () => ({
      clearRect: () => {},
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      arc: () => {},
      fill: () => {}
    }),
    width: 0,
    height: 0
  };

  const mockDoc = {
    getElementById: (id) => {
      if (id === 'stardustCanvas') return mockCanvas;
      if (id === 'appAmbientBg') return {};
      return null;
    },
    documentElement: {
      getAttribute: () => 'dark'
    },
    addEventListener: (type, fn) => {
      listeners.set(type, fn);
    },
    hidden: false
  };

  const mockWindow = {
    innerWidth: 1200,
    innerHeight: 800,
    matchMedia: () => ({ matches: false }),
    addEventListener: (type, fn) => {
      listeners.set(type, fn);
    },
    requestAnimationFrame: (fn) => setTimeout(fn, 10),
    cancelAnimationFrame: (id) => clearTimeout(id)
  };

  globalThis.window = mockWindow;
  globalThis.document = mockDoc;
  globalThis.MutationObserver = class {
    observe() {}
    disconnect() {}
  };

  try {
    const controls = setupAmbientBackground();
    assert.ok(controls);
    assert.equal(typeof controls.start, 'function');
    assert.equal(typeof controls.stop, 'function');
    assert.equal(typeof controls.resize, 'function');
    assert.equal(mockCanvas.width, 1200);
    assert.equal(mockCanvas.height, 800);
    assert.equal(setupAmbientBackground(), controls, 'repeat setup must reuse the same animation loop');

    // Stop and start calls
    controls.stop();
    controls.start();
    controls.stop();
  } finally {
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.MutationObserver;
  }
});
