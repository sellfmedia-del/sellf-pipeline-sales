module.exports = async function handler(req, res) {
  const {default:run} = await import('../offer-engine/api/preview-session.js');
  return run(req, res);
};
