// Public OAuth application identity, configured once by the website owner.
// Never place a Client Secret or access token in this file.
export const GOOGLE_CLIENT_ID='261764124421-b5g9ukdhg2t08emklkiiull4f06vktii.apps.googleusercontent.com';
// Public Worker URL only. The Gemini key belongs in Worker Secrets.
export const AI_API_BASE="https://onluyen-fe36-ai.nguyenduynd1805.workers.dev";
// Persistent libraries stay on their original storage service when AI providers change.
export const DATA_API_BASE='https://onluyen-fe36-ai.nguyenduy222-contact.workers.dev';

export function resolveGoogleClientId(configured=GOOGLE_CLIENT_ID,storage){
 const valid=value=>typeof value==='string'&&/^[\w.-]+\.apps\.googleusercontent\.com$/.test(value.trim());
 if(valid(configured))return configured.trim();
 // Compatibility for local installations configured before the visitor interface was simplified.
 try{const previous=(storage??globalThis.localStorage)?.getItem('sot-client');return valid(previous)?previous.trim():null}catch{return null}
}
