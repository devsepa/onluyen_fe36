import {readFile,readdir,access} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=path.resolve('dist');
const html=await readFile(path.join(root,'index.html'),'utf8');
const refs=[...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map(m=>m[1]);
for(const name of await readdir(root)){
 if(/\.(?:js|mjs)$/.test(name)){
  const code=await readFile(path.join(root,name),'utf8');
  for(const match of code.matchAll(/from\s+['"]([^'"]+)['"]/g))refs.push(match[1]);
 }
}
for(const ref of refs){
 if(/^(?:https?:|data:|blob:|mailto:)/.test(ref))continue;
 assert.ok(!ref.startsWith('/'),'Use relative assets for GitHub project Pages: '+ref);
 const target=path.resolve(root,ref.split(/[?#]/)[0]);
 assert.ok(target===root||target.startsWith(root+path.sep),'Asset outside publishing directory: '+ref);
 await access(target===root?path.join(root,'index.html'):target);
}
assert.ok(!html.includes('id="config"'),'Do not publish developer setup in visitor UI');
console.log(`Static deployment checks passed (${refs.length} asset/module references).`);
