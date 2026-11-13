export const OCR_LANGUAGES=['auto','eng','eng+vie','jpn+eng','jpn+vie+eng'];
export function resolveOcrLanguage(selected,name=''){
 if(!OCR_LANGUAGES.includes(selected))throw Error('Ngôn ngữ nhận dạng không hợp lệ.');
 if(selected!=='auto')return selected;
 return /(?:^|[^a-z0-9])jpd\d*(?=$|[^a-z0-9])/i.test(name)?'jpn+vie+eng':'eng';
}
