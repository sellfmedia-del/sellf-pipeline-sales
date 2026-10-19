import {dimensions} from './brief.mjs';
const string=(maxLength=4000)=>({type:'string',maxLength,minLength:1});
const list=(items,maxItems=40,minItems=0)=>({type:'array',items,maxItems,minItems});
const object=properties=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const nullable=schema=>({anyOf:[schema,{type:'null'}]});
const ids=list(string(80));
const dimension={type:'string',enum:dimensions.map(x=>x.id)};
export const reportSchema=object({
  summary:string(6000),
  sources:list(object({id:string(80),url:string(2048),title:string(300),quote:string(240),publishedAt:nullable(string(10)),period:nullable(string(100)),scope:string(300),sourceType:{type:'string',enum:['primary','secondary','review']}}),24,1),
  competitors:list(object({id:string(80),name:string(200),website:string(2048),scaleReason:string(1000),audienceReason:string(1000),geographyReason:string(1000),sourceIds:ids}),5),
  findings:list(object({id:string(80),dimension,kind:{type:'string',enum:['observation','inference','brief']},statement:string(3000),reportExcerpt:string(3000),sourceIds:ids,impact:string(2000),goalConnection:string(2000),priority:{type:'string',enum:['high','medium','low']}}),60,1),
  dimensions:list(object({id:dimension,score:nullable({type:'number',minimum:0,maximum:100}),rationale:string(3000),dataStatus:{type:'string',enum:['full','partial','insufficient']},findingIds:ids,comparisonCompetitorIds:ids,strengths:list(string(2000)),gaps:list(string(2000)),onboardingQuestions:list(string(2000))}),6,6),
  benchmarks:list(object({metric:{type:'string',enum:['webTraffic','domainAuthority','socialAudience','reviews','adActivity','contentMaturity','revenueOrGrowth','differentiator']},entries:list(object({entityId:string(80),value:nullable(string(1000)),unit:nullable(string(100)),period:nullable(string(100)),sourceIds:ids}),6,1)}),8,8),
  criticalOpportunityFindingId:nullable(string(80)),
  criticalRiskFindingId:nullable(string(80)),
  meetingQuestions:list(object({dimension,question:string(2000),findingIds:ids}),8,5),
  serviceRecommendations:list(object({id:string(80),name:string(200),hypothesis:string(2000),findingIds:ids,measurement:string(2000)}),20)
});

// Validate the same small JSON Schema subset used in the provider request;
// never trust model-side structured-output enforcement alone.
export function assertSchema(value,schema=reportSchema,path='report'){
  if(schema.anyOf){if(!schema.anyOf.some(s=>{try{assertSchema(value,s,path);return true;}catch{return false;}}))throw Error('BHS veri biçimi geçersiz: '+path);return;}
  const type=Array.isArray(value)?'array':value===null?'null':typeof value;
  if(type!==schema.type)throw Error('BHS veri türü geçersiz: '+path);
  if(schema.enum&&!schema.enum.includes(value))throw Error('BHS seçenek geçersiz: '+path);
  if(type==='string'&&(value.trim().length<(schema.minLength||0)||value.length>schema.maxLength))throw Error('BHS metin sınırı: '+path);
  if(type==='number'&&(!Number.isFinite(value)||value<schema.minimum||value>schema.maximum))throw Error('BHS sayı sınırı: '+path);
  if(type==='array'){
    if(value.length<(schema.minItems||0)||value.length>schema.maxItems)throw Error('BHS liste sınırı: '+path);
    value.forEach((item,i)=>assertSchema(item,schema.items,path+'.'+i));
  }
  if(type==='object'){
    if(schema.required.some(key=>!Object.hasOwn(value,key))||Object.keys(value).some(key=>!Object.hasOwn(schema.properties,key)))throw Error('BHS alanları geçersiz: '+path);
    for(const [key,s]of Object.entries(schema.properties))assertSchema(value[key],s,path+'.'+key);
  }
}
