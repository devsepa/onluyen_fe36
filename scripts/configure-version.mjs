import {readFile,writeFile,readdir} from 'node:fs/promises';
const version=process.env.GITHUB_SHA||JSON.parse(await readFile('dist/version.json','utf8')).version;
if(! /^[a-zA-Z0-9._-]{1,80}$/.test(version))throw Error('Invalid release version');
let html=await readFile('dist/index.html','utf8');
if(!html.includes('name="app-version"'))throw Error('Missing app-version metadata');
html=html.replace(/(<meta name="app-version" content=")[^"]+("\s*\/?\s*>)/,(_,before,after)=>before+version+after).replace(/((?:[a-zA-Z0-9._-]+\.css|app\.js)\?v=)[^"']+/g,(_,before)=>before+version);
await writeFile('dist/index.html',html);await writeFile('dist/version.json',JSON.stringify({version})+'\n');console.log('Public release version configured.');
// Version the whole module graph together so a new app cannot reuse stale helpers.
for(const file of await readdir('dist'))if(/\.(?:js|mjs)$/.test(file)){
 const path='dist/'+file,text=await readFile(path,'utf8');
 await writeFile(path,text.replace(/(from\s+['"])(\.\/[^'"?]+\.(?:mjs|js))(?:\?[^'"]*)?(['"])/g,(_,before,module,quote)=>before+module+'?v='+version+quote));
}
const sw=await readFile('dist/sw.js','utf8');await writeFile('dist/sw.js',sw.replace(/const RELEASE_VERSION='[^']*';/,`const RELEASE_VERSION='${version}';`));
