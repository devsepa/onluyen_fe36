// Build-time public endpoint only; Gemini/Cloudflare credentials never enter dist.
import {readFile,writeFile} from 'node:fs/promises';
// Force worker url to newly deployed worker with Groq AI
const hardcodedWorker = 'https://onluyen-fe36-ai.nguyenduynd1805.workers.dev';
const value = hardcodedWorker;
if(value){
 const url=new URL(value);
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||(url.pathname!=='/'&&url.pathname!==''))throw Error('AI_API_BASE must be a public HTTPS origin without credentials, path or query.');
 const path=new URL('../dist/site-config.mjs',import.meta.url),text=await readFile(path,'utf8');
 await writeFile(path,text.replace(/export const AI_API_BASE=.*?;/,`export const AI_API_BASE=${JSON.stringify(url.origin)};`));
 console.log('Public AI endpoint configured for Pages to: ' + url.origin);
}
