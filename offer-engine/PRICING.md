# Pricing engine — protected preview

The four-engine boundary is unchanged. The pricing engine owns a bounded scope-planning adapter and a deterministic cost calculator. BHS supplies findings and service hypotheses; its investment estimates, scores, revenue or raw report cannot become price inputs. The scope model has no authority over catalogue costs, account charges, markup or final prices.

## Source and arithmetic

`src/pricing/catalog.mjs` transcribes all 27 rows from the user's `01-Maliyet-ve-Teklif-Fiyat-Hesaplamas-.xlsx`, sheet `Hizmet Bedelleri`, rows 2–28. Source row numbers and all three segment columns are retained. `sellf-costs-2026-10-19-v1` is copied into the result with its segment-specific cost snapshot and SHA-256 digest. No current provider price or market-rate assumption is involved.

Calculations use integer kuruş. Minimum is cost × 1.5, rounded up to the next kuruş; ideal/default is cost × 2. These are cost markups, not revenue margins. A package has one segment-specific Account cost; a standalone single operation has 5,000 TL Account cost. The individual-operation alternative totals independently purchasable lines with that exception on every line.

Every result has three **monthly** alternatives: Growth + Operations, Operations bundle and Individual operations. They are different scopes/working arrangements, not minimum/ideal/premium bands. The Growth package has one constant monthly cost basis: `segment Account + max(initial full Growth team, one ongoing Growth consultant + selected operation costs)`. Initial and ongoing teams are not added together. The post-planning full-team row remains in the source snapshot; it is not stacked onto the retained single-consultant setup.

Influencer AHB is 10% of an explicitly supplied list amount, without applying cost markup to that commission. Unspecified list amounts, custom AI/software scope and undefined zero-cost segment rows are shown as separately priced/pending, never free. Explicit custom **costs**, when supplied, use the same markup rules. Fixed catalogue costs cannot be overridden. The empty project sheet is not a source of invented project fees. Ads, vendors and VAT are not computed or silently included in Sellf service totals.

## Budget and context

- Budget is optional. No request for a numerical budget blocks price calculation.
- Qualitative budget concern and offer guidance come only from the brief/goals/needs/meeting notes, with literal supporting quotes. BHS figures cannot supply those quotes.
- Scope planning selects the smallest useful start when context indicates a constrained budget, keeps dependencies together and explains later work. There is no arbitrary maximum service count.
- An explicit monthly TL **Sellf fee** range may narrow the scope and lower ideal pricing as far as the cost floor. It never raises the price of the same scope. A target below the minimum is visibly missed; prices and alternatives still appear. Server-trimmed scopes require review of service dependencies.
- An explicit **total growth budget** is not silently treated as the Sellf fee. A bare number in the existing budget field has unspecified scope. Fee/ads/vendor breakdown must be known before claiming the total plan fits; this does not prevent an offer.
- When the scope model fails, returns invalid output or takes over two minutes, costed alternatives for clearly labelled initial planning/explicitly discussed services are returned in review. No ambiguous paid start is automatically repeated. This fallback does not claim to price every bespoke operation.

## API and UI boundary

`/api/audit` signs a small approval proof only after a ready BHS. `/api/pricing` verifies that proof against the exact audit bytes, immutable brief, host, session and expiration. A model job gets a separate signed ticket bound to those inputs. Editing the brief invalidates the old pricing context. No browser-provided `ready` flag or invented audit can authorize pricing.

The existing BHS review adds a “Fiyat Alternatiflerini Hesapla” action and shows three monthly totals, included work, later/pending work and internal cost details. UI styles and the CRM layout are unchanged. The sandbox bridge posts only the selected brief and approved audit; it does not initialize a production database client. The service is preview-only and retains Vercel Authentication.

This step does not create/publish the final customer proposal, visually approve the logo, persist an offer or synchronize the card value. Those belong to the next proposal/persistence step; estimated value is updated only when the actual offer is created/revised.

## Validation

`test/pricing.test.mjs` covers workbook example arithmetic, segment isolation, the Account exception, Growth cost basis, BHS-budget isolation, missing and qualitative budgets, explicit ranges, under-floor constraints, custom/commission rows, fallback and signed/deduplicated API jobs. The desktop/mobile browser test now runs BHS review through the real pricing handler/calculator using mocked model output, verifies all three totals and confirms CRM records are unchanged. Local tests do not establish a fresh live BHS-to-customer-proposal run.
