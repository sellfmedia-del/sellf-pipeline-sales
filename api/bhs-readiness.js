let handler;
module.exports=async function readiness(req,res){
 handler??=import('../offer-engine/src/bhs/supervised-readiness.mjs').then(m=>m.createSupervisedReadiness());
 return (await handler)(req,res);
};
