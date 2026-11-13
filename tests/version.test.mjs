import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fetchRelease} from '../dist/version-updates.mjs';
test('version checks bypass stale caches and validate the manifest',async()=>{
 const release=await fetchRelease('https://site.test/version.json',{fetcher:async(_url,init)=>{assert.equal(init.cache,'no-store');return Response.json({version:'release-2'})}});assert.equal(release.version,'release-2');
 await assert.rejects(()=>fetchRelease('https://site.test/version.json',{fetcher:async()=>Response.json({version:'<script>'})}));
});
test('deployment stamps the same immutable version into HTML, assets and public manifest',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'study-release-'));
 try{await mkdir(join(dir,'dist'));await writeFile(join(dir,'dist','index.html'),'<meta name="app-version" content="old"><link href="app.css?v=old"><link href="study-enhancements.css?v=old"><script src="app.js?v=old"></script>');await writeFile(join(dir,'dist','version.json'),'{"version":"old"}');
 await writeFile(join(dir,'dist','app.js'),"import {a} from './helper.mjs?old';");
 const version='abcd'.repeat(10),result=spawnSync(process.execPath,[resolve('scripts/configure-version.mjs')],{cwd:dir,env:{...process.env,GITHUB_SHA:version},encoding:'utf8'});assert.equal(result.status,0,result.stderr);const html=await readFile(join(dir,'dist','index.html'),'utf8');assert.ok(!html.includes('old'));assert.equal((html.match(new RegExp(version,'g'))||[]).length,4);assert.equal(JSON.parse(await readFile(join(dir,'dist','version.json'),'utf8')).version,version);assert.ok((await readFile(join(dir,'dist','app.js'),'utf8')).includes('./helper.mjs?v='+version));
 }finally{await rm(dir,{recursive:true,force:true})}
});
