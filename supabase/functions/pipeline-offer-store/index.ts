import {createProductionGateway} from './handler.mjs';
Deno.serve(createProductionGateway({env:name=>Deno.env.get(name)}));
