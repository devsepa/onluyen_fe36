// Only use the original image when no extra content, cropping, or rotation is lost.
export function directSlideImage(slide){
 const elements=slide?.pageElements||[];if(elements.length!==1||!elements[0].image||slide.pageProperties?.pageBackgroundFill?.stretchedPictureFill)return null;
 const element=elements[0],crop=element.image.imageProperties?.cropProperties||{},transform=element.transform||{};
 if(['leftOffset','rightOffset','topOffset','bottomOffset','angle'].some(key=>Number(crop[key]||0)!==0)||Number(transform.shearX||0)!==0||Number(transform.shearY||0)!==0||Number(transform.scaleX??1)<=0||Number(transform.scaleY??1)<=0)return null;
 try{const url=new URL(element.image.contentUrl);return url.protocol==='https:'?url.href:null}catch{return null}
}
