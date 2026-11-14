import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,copyFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
async function fixture(fn){const dir=await mkdtemp(join(tmpdir(),'study-endpoints-'));try{await mkdir(join(dir,'scripts'));await mkdir(join(dir,'dist'));await copyFile(resolve('scripts/configure-ai.mjs'),join(dir,'scripts/configure-ai.mjs'));const original="export const AI_API_BASE='https://ai.example';\nexport const DATA_API_BASE='https://stored.example';\n";await writeFile(join(dir,'dist/site-config.mjs'),original);await fn(dir,original)}finally{await rm(dir,{recursive:true,force:true})}}
function run(dir,extra={}){return spawnSync(process.execPath,[join(dir,'scripts/configure-ai.mjs')],{env:{...process.env,AI_API_BASE:'',DATA_API_BASE:'',...extra},encoding:'utf8'})}
test('switching AI providers never redirects persistent libraries to an empty server',async()=>fixture(async dir=>{const result=run(dir,{AI_API_BASE:'https://new-ai.example'});assert.equal(result.status,0,result.stderr);const text=await readFile(join(dir,'dist/site-config.mjs'),'utf8');assert.ok(text.includes('https://new-ai.example'));assert.ok(text.includes("DATA_API_BASE='https://stored.example'"))}));
test('AI and data endpoints can be configured independently and preserved when unspecified',async()=>fixture(async(dir,original)=>{assert.equal(run(dir).status,0);assert.equal(await readFile(join(dir,'dist/site-config.mjs'),'utf8'),original);assert.equal(run(dir,{DATA_API_BASE:'https://original-store.example/'}).status,0);const text=await readFile(join(dir,'dist/site-config.mjs'),'utf8');assert.ok(text.includes('https://original-store.example'));assert.ok(text.includes("AI_API_BASE='https://ai.example'"))}));
test('invalid storage endpoint fails the build without partially rewriting either endpoint',async()=>fixture(async(dir,original)=>{assert.notEqual(run(dir,{AI_API_BASE:'https://new-ai.example',DATA_API_BASE:'http://not-secure.example'}).status,0);assert.equal(await readFile(join(dir,'dist/site-config.mjs'),'utf8'),original)}));
