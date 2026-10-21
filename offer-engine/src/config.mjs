// Same-project previews can use the already provisioned provider credential.
// Values stay server-side; the offer service never exports a provider key.
export const offerGeminiKey=()=>process.env.OFFER_GEMINI_API_KEY||process.env.GEMINI_API_KEY;
