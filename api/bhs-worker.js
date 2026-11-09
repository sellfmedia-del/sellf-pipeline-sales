module.exports = async function handler(req, res) {
 const {default:run}=await import('../offer-engine/api/bhs-worker.js');
 return run(req,res);
};
