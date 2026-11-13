// Resolve a model actually available to this project before deployment; no billed generation.
import {readFile,writeFile} from 'node:fs/promises';
const path=new URL('../backend/wrangler.jsonc',import.meta.url),config=JSON.parse(await readFile(path,'utf8'));
const response=await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000',{headers:{'x-goog-api-key':process.env.GEMINI_API_KEY},signal:AbortSignal.timeout(20000)});
if(!response.ok)throw Error(`Cannot list Gemini models (HTTP ${response.status}); check API key and project access.`);
const body=await response.json(),names=(body.models||[]).filter(m=>m.supportedGenerationMethods?.includes('generateContent')).map(m=>m.name.replace(/^models\//,''));
let model=config.vars.GEMINI_MODEL;
if(!names.includes(model)){
 const regular=names.filter(n=>/^gemini-\d+(?:\.\d+)?-flash$/.test(n)).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}));
 const lite=names.filter(n=>/^gemini-\d+(?:\.\d+)?-flash-lite$/.test(n)).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}));
 model=regular[0]||lite[0]||(names.includes('gemini-flash-latest')?'gemini-flash-latest':null);
 if(!model)throw Error('No stable Flash model available to this project. Select a supported Gemini model.');
 config.vars.GEMINI_MODEL=model;await writeFile(path,JSON.stringify(config,null,2)+'\n');
}
const fallbacks=names.filter(n=>n!==model&&/^gemini-\d+(?:\.\d+)?-flash-lite$/.test(n)).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}));
if(fallbacks[0])config.vars.GEMINI_FALLBACK_MODEL=fallbacks[0];else delete config.vars.GEMINI_FALLBACK_MODEL;
await writeFile(path,JSON.stringify(config,null,2)+'\n');
console.log(`Verified available Gemini model: ${model}; fallback: ${config.vars.GEMINI_FALLBACK_MODEL||'none'}`);
