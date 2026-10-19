const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../offers/brief-model.js');

const context = {
  spaceId: 'space-one',
  lead: { id:'lead-one', company:'Example Brand', name:'Example Contact', value:'₺90.000', notes:'Original notes',
    timeline:[{date:'17 Ekim 2026',type:'Toplantı',note:'Original meeting'}] }
};
function valid() {
  return { ...model.createDraft(context), segment:'corporate', website:'brand.example',
    logo:{status:'ready',sourceType:'upload',sourceWebsite:'https://brand.example/',generated:false,image:'data:image/png;base64,AAA',reviewed:true,quality:{transparency:true,matteStable:true,touchesEdge:false,changedSolid:0}}, goals:'Profitable growth', needs:'Improve retention', services:'Growth and operations' };
}

test('draft captures card and meeting context without sharing mutable CRM objects', () => {
  const original=JSON.stringify(context);
  const draft=model.createDraft(context);
  assert.equal(draft.brandName,'Example Brand');
  assert.match(draft.meetingNotes,/Original notes/);
  assert.match(draft.meetingNotes,/Original meeting/);
  draft.source.timeline[0].note='Changed draft';
  draft.brandName='Different brand';
  assert.equal(JSON.stringify(context),original);
  assert.equal(draft.source.leadId,'lead-one');
  assert.equal(draft.source.spaceId,'space-one');
});
test('new brief does not invent a segment, website, budget or services',()=>{
  const draft=model.createDraft(context);
  for(const name of ['segment','website','budget','services','goals','needs']) assert.equal(draft[name],'');
});
test('validation reports all required missing inputs without clearing existing input',()=>{
  const draft=model.createDraft(context);
  const before=JSON.stringify(draft);
  assert.deepEqual(Object.keys(model.validate(draft)),['segment','website','logoUrl','goals','needs','services']);
  assert.equal(JSON.stringify(draft),before);
});
test('all three explicitly selected segments pass and unknown segments fail',()=>{
  for(const segment of ['kobi','corporate','key_account']) assert.deepEqual(model.validate({...valid(),segment}),{});
  assert.ok(model.validate({...valid(),segment:'automatic'}).segment);
});
test('budget may be unknown, zero or positive; negative and nonfinite values fail',()=>{
  for(const budget of ['', '0', '25000.50']) assert.deepEqual(model.validate({...valid(),budget}),{});
  for(const budget of ['-1','NaN','Infinity','fifty']) assert.ok(model.validate({...valid(),budget}).budget);
});
test('URL validation normalizes domains and rejects executable protocols or credentials',()=>{
  assert.equal(model.webUrl('brand.example'),'https://brand.example/');
  assert.equal(model.webUrl('https://brand.example/path?q=1'),'https://brand.example/path?q=1');
  for(const input of ['javascript:alert(1)','data:image/png,x','file:///tmp/image.png','https://user:pass@brand.example','not a url','localhost']) assert.equal(model.webUrl(input),'');
});
test('logos require an image of a supported type within the file size limit',()=>{
  assert.equal(model.validateLogo({type:'image/png',size:100}), '');
  assert.ok(model.validateLogo({type:'image/svg+xml',size:100}));
  assert.ok(model.validateLogo({type:'image/png',size:2*1024*1024+1}));
  assert.ok(model.validate({...valid(),logo:null,logoFile:{name:'logo.png',type:'image/png',size:100}}).logoUrl);
  assert.ok(model.validate({...valid(),logo:null,logoUrl:'https://brand.example/logo.png'}).logoUrl);
});
test('different cards and empty notes produce independent snapshots',()=>{
  const one=model.createDraft(context);
  const two=model.createDraft({spaceId:'space-two',lead:{id:'lead-two',company:'Another Brand'}});
  assert.equal(two.source.leadId,'lead-two');
  assert.equal(two.meetingNotes,'');
  assert.equal(one.source.company,'Example Brand');
});
test('processed logos must be complete, original and tied to the current website',()=>{
  const draft=valid();
  assert.deepEqual(model.validate(draft),{});
  assert.ok(model.validate({...draft,website:'other.example'}).logoUrl);
  assert.ok(model.validate({...draft,logo:{...draft.logo,status:'loading'}}).logoUrl);
  assert.deepEqual(model.validate({...draft,logo:{...draft.logo,status:'review',reviewed:false}}),{});
  assert.ok(model.validate({...draft,logo:{...draft.logo,status:'review'}},{requireLogoReview:true}).logoUrl);
  assert.ok(model.validate({...draft,logo:{...draft.logo,generated:true}}).logoUrl);
});
test('background removal is mandatory; visual review is deferred until final proposal approval',()=>{
  const draft=valid();
  assert.deepEqual(model.validate(draft),{});
  assert.ok(model.validate({...draft,logo:{...draft.logo,reviewed:false}}).logoUrl);
  assert.deepEqual(model.validate({...draft,logo:{...draft.logo,status:'review',reviewed:false}}),{});
  assert.ok(model.validate({...draft,logo:{...draft.logo,status:'review',reviewed:false}},{requireLogoReview:true}).logoUrl);
  for(const quality of [{transparency:false,matteStable:true,touchesEdge:false},{transparency:true,matteStable:false,touchesEdge:false},{transparency:true,matteStable:true,touchesEdge:true}])assert.ok(model.validate({...draft,logo:{...draft.logo,quality}}).logoUrl);
});
