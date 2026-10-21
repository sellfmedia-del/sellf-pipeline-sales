# Sellf Offerletter

Separate Vercel project: sellf-offerletter. Home, contact, and offer-extension search pages remain available in Turkish and English.

Search validates the supplied extension and opens its password screen. Only proposal slugs and four customer portal assets are rewritten to the existing Pipeline renderer. The local `/api/offer` proxy accepts customer access only and forwards neither Pipeline sessions nor operator actions. Password checks and documents remain in the Pipeline offer service; this project has no provider/database secrets. Contact and contract buttons open native email drafts and never send mail automatically.

Turkish pages are served at /, /iletisim and /teklifinizi-arayin; their English equivalents are /en, /en/contact and /en/find-your-proposal. Language switches retain the corresponding page and work without JavaScript. Search messages, form labels and native email drafts use the page language.

Pipeline production uses `OFFER_PUBLIC_ORIGIN=https://offerletter.sellfmedia.com` to format customer links. Drafts remain private until the owner publishes them; the saved card exposes review and publish controls. This integration does not change DNS, audit research, pricing, or Travis.
