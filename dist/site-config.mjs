// Public OAuth application identity, configured once by the website owner.
// Never place a Client Secret or access token in this file.
export const GOOGLE_CLIENT_ID='261764124421-b5g9ukdhg2t08emklkiiull4f06vktii.apps.googleusercontent.com';

export function resolveGoogleClientId(configured=GOOGLE_CLIENT_ID,storage){
 const valid=value=>typeof value==='string'&&/^[\w.-]+\.apps\.googleusercontent\.com$/.test(value.trim());
 if(valid(configured))return configured.trim();
 // Compatibility for local installations configured before the visitor interface was simplified.
 try{const previous=(storage??globalThis.localStorage)?.getItem('sot-client');return valid(previous)?previous.trim():null}catch{return null}
}
