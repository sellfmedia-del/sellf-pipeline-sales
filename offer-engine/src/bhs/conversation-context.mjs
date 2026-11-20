import {BudgetError,hash} from '../budget/ledger.mjs';

export const conversationContextVersion='one-brief-one-budget-context-v1';
export const contextKey=id=>'audit:conversation:context:'+id;
export async function ensureConversationContext({brief,ledger,id}){
 const cost=await ledger.status();
 if(typeof cost.id!=='string'||cost.capKurus!==5000||!Number.isSafeInteger(cost.chargedKurus)||cost.chargedKurus<0||cost.chargedKurus>5000)
  throw new BudgetError('budget_context','Analizin tek 50 TL hesabı doğrulanamadı.');
 const expected={version:conversationContextVersion,conversationId:id,briefDigest:hash(brief),budgetId:cost.id,capKurus:5000};
 let key=contextKey(id),saved=await ledger.get(key);
 if(saved&&saved.state!=='complete'&&saved.charge_kurus===0){key+=':recovered';saved=await ledger.get(key);}
 const context=saved?.state==='complete'?saved.value:await ledger.once(key,expected,0,async()=>expected);
 if(hash(context)!==hash(expected))throw new BudgetError('budget_context','Korunmuş brief, konuşma veya bütçe başka bir çalışmaya ait. Ücretli çağrı başlatılmadı.');
 return context;
}
