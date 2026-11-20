// Unit tests select their own BHS mode. Deployment activation flags apply to
// the later build/runtime process, not to legacy fixture defaults in tests.
for(const key of ['OFFER_BHS_MANAGED','OFFER_BHS_RESEARCH_VERSION','OFFER_BHS_COLLECTION_FIRST','OFFER_BHS_BACKGROUND_ENABLED','OFFER_BHS_SEQUENTIAL_PRODUCTION_ENABLED','OFFER_BHS_CONVERSATION_ENABLED'])delete process.env[key];
process.env.OFFER_BHS_CONVERSATION_ENABLED='false';
