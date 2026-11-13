import {readFile,writeFile} from 'node:fs/promises';
const emails=(process.env.MODERATOR_EMAILS||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
if(emails.some(email=>!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))throw Error('Invalid moderator email configuration');
const path=new URL('../backend/wrangler.jsonc',import.meta.url),config=JSON.parse(await readFile(path,'utf8'));config.vars.MODERATOR_EMAILS=emails.join(',');await writeFile(path,JSON.stringify(config,null,2)+'\n');console.log('Moderator allowlist configured.');
