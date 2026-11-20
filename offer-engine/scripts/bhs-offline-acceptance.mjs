import {readFile} from 'node:fs/promises';
import {inspectConversationAcceptance} from '../src/bhs/conversation-acceptance.mjs';

// Reads an exported retained result. It cannot start/resume any BHS job.
const path=process.argv[2];
if(!path)throw Error('Kayıtlı brief/stored/cost JSON dosyası gerekli. Ücretli işlem başlatılmaz.');
const result=inspectConversationAcceptance(JSON.parse(await readFile(path,'utf8')));
console.info(JSON.stringify(result,null,2));
if(result.issues.length)process.exitCode=1;
