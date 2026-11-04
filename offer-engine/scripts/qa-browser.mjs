// Explicit QA entry point; normal production builds do not launch browsers.
import chromium from '@sparticuz/chromium';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const cwd=fileURLToPath(new URL('../../',import.meta.url));
function run(args,env=process.env){const result=spawnSync('npm',args,{cwd,env,stdio:'inherit'});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status??1);}
run(['run','build']);
const executablePath=await chromium.executablePath();
run(['test'],{...process.env,LOGO_TEST_CHROMIUM:executablePath});
