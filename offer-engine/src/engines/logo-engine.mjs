import {prepareUploadedLogo} from '../upload.mjs';
export const logoEngine=Object.freeze({
  id:'logo',version:'1.0.0',
  async run(input){return {status:'review',data:await prepareUploadedLogo(input?.image)};}
});
