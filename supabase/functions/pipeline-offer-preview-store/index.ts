import {createPreviewGateway} from './handler.mjs';
Deno.serve(createPreviewGateway({env:name=>Deno.env.get(name)}));
