import {prepareUploadedLogo} from '../upload.mjs';
export const createLogoEngine=options=>Object.freeze({
  id:'logo',version:'1.1.0',
  async run(input){return {status:'review',data:await prepareUploadedLogo(input?.image,options)};}
});
export const logoEngine=createLogoEngine();
