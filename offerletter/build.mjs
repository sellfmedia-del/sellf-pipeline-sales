import {cp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),out=path.join(here,'public');
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
await cp(path.join(here,'site'),out,{recursive:true});
const script=await readFile(path.join(here,'..','offers/proposal.js'),'utf8'),mark=script.match(/data:image\/png;base64,([A-Za-z0-9+/=]+)/)?.[1];
if(!mark)throw Error('Original Sellf mark missing.');await writeFile(path.join(out,'brandmark.png'),Buffer.from(mark,'base64'));
console.log('Built standalone website preview. No Pipeline integration.');
