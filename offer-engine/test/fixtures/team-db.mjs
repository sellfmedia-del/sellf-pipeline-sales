import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createProductionGateway} from '../../../supabase/functions/pipeline-offer-store/handler.mjs';
export const users=['33565c0c-67ea-4435-9df8-6814035dfd11','c96b0083-7180-4c2d-bded-a4b1a83dd500','9bca4f9e-0c0b-412d-9db7-c5857bdd2222'];
export const gatewayKey='g'.repeat(43),portalSecret='synthetic-team-test-secret-32-characters',tokens=users.map((_,i)=>'synthetic-user-'+i+'-session-token-123456789');
const schema=name=>readFile(new URL('../../schema/'+name,import.meta.url),'utf8');
export async function teamDatabase(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key,is_anonymous boolean default false,raw_app_meta_data jsonb default '{}',deleted_at timestamptz);
 create table public.spaces(id text primary key,user_id uuid,name text,color text,created_at bigint);
 create table public.leads(id text primary key,space_id text,col_id text,name text,company text,value text,notes text,doc_url text,last_contact bigint,contacts jsonb,timeline jsonb);
 grant usage on schema public,auth to service_role;grant all on public.spaces,public.leads to service_role;`);
 for(const id of users)await db.query('insert into auth.users(id) values($1)',[id]);
 await db.query("insert into spaces values('space-1',$1,'Sales','#123456',123)",[users[0]]);
 await db.query("insert into leads values('lead-1','space-1','column-1','Person','Brand','123','Original meeting notes','https://example.invalid/document',123,'[{\"name\":\"Contact\"}]','[{\"type\":\"Meeting\"}]')");
 await db.exec(await schema('production-release.sql'));await db.exec(await schema('offer-variants.sql'));
 // Exact deployed definitions, including the additional budget worker.
 await db.exec(await schema('shared-team-offers-rollback.sql'));
 await db.query('insert into pipeline_offer_gateway_config(key_hash) values($1)',[createHash('sha256').update(gatewayKey).digest('hex')]);
 const rpcNames=new Set(['save_pipeline_offer_production','save_pipeline_offer_variant','publish_pipeline_offer_link','update_pipeline_offer_prices','pipeline_offer_production_budget_op','pipeline_offer_additional_budget_op']);
 async function rpc(name,args){
  if(!rpcNames.has(name))throw Error('Unexpected RPC');
  const entries=Object.entries(args);if(entries.some(([k])=>!/^p_[a-z_]+$/.test(k)))throw Error('Invalid test argument');
  return db.transaction(async tx=>{await tx.exec('set local role service_role');return (await tx.query('select public.'+name+'('+entries.map(([k],i)=>k+'=>$'+(i+1)).join(',')+') as result',entries.map(([,v])=>v&&typeof v==='object'?JSON.stringify(v):v))).rows[0].result;});
 }
 const tables=new Set(['leads','spaces','pipeline_offer_versions','pipeline_offer_price_history','pipeline_offer_gateway_config']);
 async function fetchImpl(input,init={}){
  const url=new URL(input);let value;
  try{
   if(url.pathname==='/auth/v1/user'){
    const index=tokens.indexOf(init.headers.Authorization?.slice(7));if(index<0)return new Response('{}',{status:401});
    const user=(await db.query('select * from auth.users where id=$1 and deleted_at is null',[users[index]])).rows[0];if(!user)return new Response('{}',{status:401});value={id:user.id,is_anonymous:user.is_anonymous,app_metadata:user.raw_app_meta_data};
   }else if(url.pathname.startsWith('/rest/v1/rpc/'))value=await rpc(url.pathname.split('/').at(-1),JSON.parse(init.body));
   else{
    const table=url.pathname.split('/').at(-1);if(!tables.has(table))throw Error('Unexpected table');
    const params=[],where=[];
    for(const [key,filter] of url.searchParams){
     if(['select','order','limit'].includes(key))continue;
     const field=key==='customer_document->publication->>slug'?"customer_document#>>'{publication,slug}'":/^[a-z_]+$/.test(key)?key:null;
     const m=filter.match(/^(eq|neq)\.(.*)$/);if(!field||!m)throw Error('Unexpected filter');params.push(m[2]);where.push(field+(m[1]==='eq'?'=':'<>')+'$'+params.length);
    }
    const order=url.searchParams.get('order');if(order&&!/^[a-z_]+\.(asc|desc)$/.test(order))throw Error('Unexpected order');
    const fields=url.searchParams.get('select')||'*';if(!/^[a-z_,*]+$/.test(fields))throw Error('Unexpected projection');
    const limit=Number(url.searchParams.get('limit')||1000);if(!Number.isSafeInteger(limit))throw Error('Unexpected limit');
    value=(await db.query('select '+fields+' from public.'+table+(where.length?' where '+where.join(' and '):'')+(order?' order by '+order.replace('.',' '):'')+' limit '+limit,params)).rows;
   }
   return new Response(JSON.stringify(value));
  }catch(error){return new Response(JSON.stringify({message:error.message,code:error.code||'TEST_DB'}),{status:422});}
 }
 const gateway=createProductionGateway({env:n=>({SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'server-fixture',SUPABASE_ANON_KEY:'public-fixture'})[n],fetchImpl});
 return {db,rpc,fetchImpl,gateway,apply:async()=>{for(const name of ['20261022095034_shared_sales_team_offers.sql','20261022100843_offer_worker_registered_user_lookup.sql'])await db.exec(await readFile(new URL('../../../supabase/migrations/'+name,import.meta.url),'utf8'));}};
}
