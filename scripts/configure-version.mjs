import {readFile,writeFile} from 'node:fs/promises';
const version=process.env.GITHUB_SHA||JSON.parse(await readFile('dist/version.json','utf8')).version;
if(! /^[a-zA-Z0-9._-]{1,80}$/.test(version))throw Error('Invalid release version');
let html=await readFile('dist/index.html','utf8');
if(!html.includes('name="app-version"'))throw Error('Missing app-version metadata');
html=html.replace(/(<meta name="app-version" content=")[^"]+("\s*\/?\s*>)/,(_,before,after)=>before+version+after).replace(/((?:app\.(?:css|js)|study-enhancements\.css)\?v=)[^"']+/g,(_,before)=>before+version);
await writeFile('dist/index.html',html);await writeFile('dist/version.json',JSON.stringify({version})+'\n');console.log('Public release version configured.');
