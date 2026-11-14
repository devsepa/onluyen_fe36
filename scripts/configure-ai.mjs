// Build-time public endpoint only; Gemini/Cloudflare credentials never enter dist.
import {readFile,writeFile} from 'node:fs/promises';
const path=new URL('../dist/site-config.mjs',import.meta.url);let text=await readFile(path,'utf8');
for(const name of ['AI_API_BASE','DATA_API_BASE']){
 const value=process.env[name]?.trim();if(!value)continue;
 const url=new URL(value);
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||(url.pathname!=='/'&&url.pathname!==''))throw Error(name+' must be a public HTTPS origin without credentials, path or query.');
 const pattern=new RegExp('export const '+name+'\\s*=.*?;');if(!pattern.test(text))throw Error('Missing endpoint '+name);text=text.replace(pattern,`export const ${name}=${JSON.stringify(url.origin)};`);
}
await writeFile(path,text);console.log('Public AI and persistent-data endpoints configured independently.');
