const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
const table=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0});
export function crc32(bytes){let crc=0xffffffff;for(const b of bytes)crc=table[(crc^b)&255]^(crc>>>8);return (crc^0xffffffff)>>>0}
// Store-only ZIP: standard, inspectable, and no decompression/zip-bomb surface on restore.
export function writeBackupZip(files){
 const parts=[],directory=[];let offset=0;
 for(const [name,raw]of files){const bytes=raw instanceof Uint8Array?raw:encoder.encode(raw),filename=encoder.encode(name),crc=crc32(bytes),header=new Uint8Array(30+filename.length),h=new DataView(header.buffer);h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x800,true);h.setUint32(14,crc,true);h.setUint32(18,bytes.length,true);h.setUint32(22,bytes.length,true);h.setUint16(26,filename.length,true);header.set(filename,30);parts.push(header,bytes);
  const central=new Uint8Array(46+filename.length),c=new DataView(central.buffer);c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x800,true);c.setUint32(16,crc,true);c.setUint32(20,bytes.length,true);c.setUint32(24,bytes.length,true);c.setUint16(28,filename.length,true);c.setUint32(42,offset,true);central.set(filename,46);directory.push(central);offset+=header.length+bytes.length;
 }
 const size=directory.reduce((n,b)=>n+b.length,0),end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,files.size,true);e.setUint16(10,files.size,true);e.setUint32(12,size,true);e.setUint32(16,offset,true);return new Blob([...parts,...directory,end],{type:'application/zip'});
}
export function readBackupZip(buffer,{maxBytes=256*1024*1024,maxFiles=5001}={}){
 const bytes=new Uint8Array(buffer),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);if(bytes.length<22||bytes.length>maxBytes)throw Error('File sao lưu quá lớn hoặc không hợp lệ.');
 const end=bytes.length-22;if(view.getUint32(end,true)!==0x06054b50||view.getUint16(end+20,true)!==0||view.getUint16(end+4,true)||view.getUint16(end+6,true))throw Error('File không phải bản sao lưu ZIP do web tạo.');
 const count=view.getUint16(end+10,true),centralSize=view.getUint32(end+12,true),centralOffset=view.getUint32(end+16,true);if(!count||count>maxFiles||count!==view.getUint16(end+8,true)||centralOffset+centralSize!==end)throw Error('Danh mục sao lưu không hợp lệ.');
 const files=new Map();let at=centralOffset,total=0;const ranges=[];
 for(let i=0;i<count;i++){
  if(at+46>end||view.getUint32(at,true)!==0x02014b50)throw Error('Danh mục sao lưu bị hỏng.');
  const flags=view.getUint16(at+8,true),method=view.getUint16(at+10,true),crc=view.getUint32(at+16,true),size=view.getUint32(at+24,true),compressed=view.getUint32(at+20,true),nameLength=view.getUint16(at+28,true),extra=view.getUint16(at+30,true),comment=view.getUint16(at+32,true),start=view.getUint32(at+42,true);
  if(flags!==0x800||method!==0||size!==compressed||at+46+nameLength+extra+comment>end||start+30>centralOffset||view.getUint32(start,true)!==0x04034b50)throw Error('Kiểu nén hoặc cấu trúc sao lưu không được hỗ trợ.');
  const name=decoder.decode(bytes.subarray(at+46,at+46+nameLength));if(! /^(?:manifest\.json|images\/[a-f0-9]{64})$/.test(name)||files.has(name))throw Error('Tên tệp trong sao lưu không hợp lệ hoặc trùng.');
  const localName=view.getUint16(start+26,true),localExtra=view.getUint16(start+28,true),dataStart=start+30+localName+localExtra,dataEnd=dataStart+size;
  if(view.getUint16(start+6,true)!==flags||view.getUint16(start+8,true)!==0||view.getUint32(start+14,true)!==crc||view.getUint32(start+18,true)!==size||view.getUint32(start+22,true)!==size||dataEnd>centralOffset||decoder.decode(bytes.subarray(start+30,start+30+localName))!==name)throw Error('Dữ liệu sao lưu không khớp danh mục.');
  total+=size;if(total>maxBytes||ranges.some(([a,b])=>start<b&&dataEnd>a))throw Error('Dữ liệu sao lưu chồng lấp hoặc vượt giới hạn.');ranges.push([start,dataEnd]);const data=bytes.subarray(dataStart,dataEnd);if(crc32(data)!==crc)throw Error('File sao lưu bị hỏng; mã kiểm tra không khớp.');files.set(name,data);at+=46+nameLength+extra+comment;
 }
 if(at!==end||!files.has('manifest.json'))throw Error('Thiếu thông tin thư viện trong sao lưu.');return files;
}
