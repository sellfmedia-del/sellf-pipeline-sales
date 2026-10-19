/* Direct Pipeline preview adapter. No production Supabase client or credentials. */
(function(){'use strict';
 window.PipelineOfferPersistence=true;
 let fixture=null,rows=null,loading=null,saveChain=Promise.resolve();
 const stages=[['Yeni Lead','#378ADD'],['İlk Temas','#639922'],['Teklif Aşamasında','#BA7517'],['Sözleşme Gönderildi','#D4537E'],['Kazanıldı','#1D9E75']];
 const metadataKey=()=> 'pipeline-preview-layout-v1:'+fixture.user.id;
 async function api(body){const r=await fetch('/api/preview-session',{...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{}),cache:'no-store'});const data=await r.json();if(!r.ok)throw Error(data.error||'Test alanına bağlanılamadı.');return data;}
 function metadata(){if(rows)try{localStorage.setItem(metadataKey(),JSON.stringify({spaces:rows.spaces,columns:rows.columns}));}catch{}}
 function install(value){
  fixture=value;rows=structuredClone(value.rows);let layout;
  try{layout=JSON.parse(localStorage.getItem(metadataKey())||'null');}catch{}
  if(Array.isArray(layout?.spaces)&&Array.isArray(layout?.columns)){
   rows.spaces=[...layout.spaces,...rows.spaces.filter(s=>!layout.spaces.some(x=>x.id===s.id))];rows.columns=layout.columns;
  }
  for(const space of rows.spaces){
   const serverColumn=value.rows.columns.find(c=>c.space_id===space.id);
   if(!rows.columns.some(c=>c.space_id===space.id)||rows.columns.filter(c=>c.space_id===space.id).length===1&&serverColumn?.title==='Teklif Aşamasında'){
    rows.columns=rows.columns.filter(c=>c.space_id!==space.id);
    rows.columns.push(...stages.map(([title,dot],i)=>title===serverColumn?.title?serverColumn:{id:'preview-'+space.id+'-'+i,space_id:space.id,title,dot}));
   }
  }
  metadata();
 }
 async function session(){
  if(!loading)loading=api().then(state=>{if(state.ready)install(state.fixture);return state;});
  await loading;return {data:{session:fixture?{user:fixture.user}:null}};
 }
 function merge(table,items){for(const item of items){const i=rows[table].findIndex(x=>x.id===item.id);if(i<0)rows[table].push(structuredClone(item));else rows[table][i]=structuredClone(item);}metadata();}
 function queued(operation){const result=saveChain.then(operation);saveChain=result.catch(()=>{});return result;}
 window.supabase={createClient(){return {
  auth:{getSession:session,async getUser(){await session();return {data:{user:fixture?.user||null}};},async signOut(){await saveChain;await api({action:'logout'});fixture=null;rows=null;loading=Promise.resolve({ready:false});const b=document.querySelector('#pipeline-test-start');if(b)b.disabled=false;}},
  from(table){
   if(!['spaces','columns','leads'].includes(table))throw Error('Bu önizleme yalnızca test kartlarını kullanır.');
   return {
    select(){const result=()=>({data:structuredClone(rows?.[table]||[]),error:null});return {then:(resolve,reject)=>Promise.resolve(result()).then(resolve,reject),in:async(field,values)=>({...result(),data:result().data.filter(row=>values.includes(row[field]))})};},
    async upsert(items){
     if(!fixture)throw Error('Test oturumu gerekli.');
     if(table!=='leads'){merge(table,items);return {error:null};}
     return queued(async()=>{const result=await api({action:'sync-cards',leads:items});merge('leads',result.leads);return {error:null};});
    },
    delete(){return {eq:async(field,value)=>{
     if(field!=='id'||!fixture)throw Error('Test kaydı geçersiz.');
     const key={spaces:'space_id',columns:'col_id',leads:'id'}[table];
     await queued(()=>api({action:'delete-cards',field:key,value}));
     rows.leads=rows.leads.filter(row=>row[key]!==value);rows[table]=rows[table].filter(row=>row.id!==value);if(table==='spaces')rows.columns=rows.columns.filter(row=>row.space_id!==value);metadata();return {error:null};
    }};}
   };
  }
 };}};
 window.addEventListener('pipeline-offer-saved',event=>{const row=rows?.leads.find(row=>row.id===event.detail.leadId);if(row)row.value=String(event.detail.offer.monthlyAmount);});
 document.addEventListener('DOMContentLoaded',()=>{
  const button=document.querySelector('#pipeline-test-start'),status=document.querySelector('#pipeline-test-status');
  button.addEventListener('click',async()=>{button.disabled=true;status.textContent='Test alanı açılıyor…';try{const state=await api({action:'start'});install(state.fixture);loading=Promise.resolve(state);await showCRM();status.textContent='';}catch(error){status.textContent=error.message;button.disabled=false;}});
  session().then(()=>{button.disabled=false;status.textContent='';}).catch(error=>{status.textContent=error.message;button.disabled=false;loading=null;});
  document.querySelector('a[href="/travis.html"]')?.addEventListener('click',event=>{event.preventDefault();alert('Travis bu teklif önizlemesine dahil değildir.');});
 });
})();
