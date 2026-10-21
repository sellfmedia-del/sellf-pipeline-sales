import {cp,mkdir,rm} from 'node:fs/promises';
import path from 'node:path';import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),out=path.join(here,'public');
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
await cp(path.join(here,'site'),out,{recursive:true});
console.log('Built standalone website preview. No Pipeline integration.');
