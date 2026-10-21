# Sellf Offerletter website preview

Separate Vercel project: sellf-offerletter. Scope: home, contact, and offer-extension search page. The user must approve the website before any Pipeline link integration is implemented.

This website currently has no API, no Pipeline requests, no provider/database secrets, no customer document and no live offer lookup. Search validates the supplied extension locally and explicitly explains that offer access will open after the separate integration step. Contact opens a native email draft; it does not send mail. All sources live under this folder. The build reads only the existing Sellf logo asset from the shared renderer.

No Pipeline sources, environment variables, published offer URLs, DNS or production deployment are changed by this preview.
