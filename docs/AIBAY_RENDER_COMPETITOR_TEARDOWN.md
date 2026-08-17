# AiBay vs. aibay-3gql.onrender.com — Evidence-Based Teardown

Reviewed 2026-08-17 by probing the live public deployment (`https://aibay-3gql.onrender.com`). Everything below is what the deployment itself returned; nothing is inferred beyond that.

## What the Render deployment actually exposes (public endpoints)

| Endpoint | Response | Interpretation |
| --- | --- | --- |
| `GET /` | Landing: "AIBAY — eBay Market Intelligence Platform", "Beats ZikAnalytics", Smart Workflow (Research→Source→Generate→Profit), Quick Analyzer, Market Research, Turbo Scanner, Trending Now, Top Sellers, Generate Listing, Keyword Tool, Hot Categories with +% values, Recent Listings | Marketing surface |
| `GET /api/health` | `{"status":"ok"}` | Basic health |
| `GET /api/stats` | `{"totalListings":5,"totalWatchlist":1,"totalTrackedSellers":0,"keywordSearchesToday":0,"ebayConfigured":true}` | Counter row, single shared dataset |
| `GET /api/ebay/status` | `{"configured":true,"mode":"scrape-first","liveDataRequired":true,"capabilities":{"liveScraping":true,"apiKeyConfigured":true}}` | Claims eBay scraping is live |
| `GET /api/listings` | 5 stored listings | CRUD persistence (SQLite-style) |
| `GET /api/watchlist` | 1 row | CRUD persistence |

## Evidence of data quality problems (from their own responses)

1. **Every listing has `"price": 0`** — including a perfume whose raw title contains a price. Their "live scraping" captured zero prices on every record. The `ebayConfigured:true` / `liveScraping:true` claim is not supported by the stored data.
2. **Identical boilerplate "AI" output on every listing**: all 5 records contain the same generated HTML template — "Premium Quality · Fast Dispatch · Satisfaction Guaranteed", identical Key Features bullets, identical item specifics ("Condition: New", "Brand: Unbranded"), identical `titleScore` (70) and identical three suggestions. This is a template, not per-product AI generation.
3. **The single watchlist record is a junk placeholder**: `productTitle: "* - Very Good | Top Rated"`, `productUrl: "https://www.ebay.com/sch/i.html?_nkw=*"`, `imageUrl: "https://placehold.co/200x200/1a1a2e/ffffff?text=*"`, empty keyword, `sellThroughRate: null`, `lastCheckedAt: null`. The dashboard's "1 Watchlist Item" stat is a test row.
4. **"Hot Categories +18% … +62%"** carry no source URL, no timestamp, no observation count, and no method. Unverifiable.
5. **"Beats ZikAnalytics"** is an unsupported marketing claim, like the page's "The most powerful eBay intelligence platform."
6. Their `mode: "scrape-first"` for eBay means HTML scraping of eBay, which is outside eBay's permitted programmatic access model (official API terms) — a compliance risk we do not copy.

## Our position (aibay-pro) — feature-for-feature, truthfully

| Their surface | Our equivalent | Evidence status |
| --- | --- | --- |
| Dashboard stats | Local vault stats (watchlist, tracked sellers, generated, scans) — real counts from actual stored rows | VERIFIED — no placeholder rows |
| Quick Analyzer / Market Research | `/api/intelligence/opportunity` (9 explainable components) + `/api/products/research` | VERIFIED — evidence-gated, INSUFFICIENT_EVIDENCE default |
| Turbo Scanner (100+ products) | `/api/tools/scanner` — bounded: max 10 URLs, 3/domain, concurrency 2, 1 attempt, dedup, per-row status | VERIFIED — bounded by design, blocked entries reported |
| Trending Now | `/api/trends/hot` — evidence-gated: ≥3 dated observations, ≥20% delta before HOT | VERIFIED — no fabricated percentages |
| Top Sellers | Tracked-sellers vault + competitor/seller profiling (observable data only) | VERIFIED — revenue never inferred |
| Generate Listing | `/api/tools/generate` + `/api/products/optimize` — deterministic package, title score with fixes, category suggestions, optional profit estimate | VERIFIED — draft-only, no template boilerplate |
| Keyword Tool (STR) | `/api/tools/keywords` — STR only when sold/active observations are supplied, else UNVERIFIED | VERIFIED — truthful STR |
| Profit | `/api/tools/profit` — fee presets, line items, assumptions, breakeven, ESTIMATED label | VERIFIED — never a guarantee |
| Watchlist | Browser-local vault (watchlist + tracked sellers) with JSON export/import; change detection engine ready | VERIFIED — labeled browser-local until durable infra |
| "Live eBay" claim | Official Browse API adapter only; UNCONFIGURED until credentials; never claims live without it | VERIFIED — no fake live data |
| Persistence | Local vault (browser) today; durable queue/D1/KV/R2 documented migration | PARTIAL — truthful |
| AI generation | Free multi-route AI (AI_ROUTES: Groq/Gemini/OpenRouter :free/Workers AI/Ollama) with failover; deterministic fallback | VERIFIED — no invented "AI" template |

## Scorecard

| Dimension | Render deployment | aibay-pro |
| --- | --- | --- |
| Real API surface | 5 endpoints, 2 with data | 20+ endpoints, all tested |
| Data integrity | price=0 everywhere, placeholder rows, template "AI" | Evidence + provenance on every value, no placeholders |
| Compliance | Claims eBay scraping; unsupported "beats ZIK" | Official APIs only; truthful states only |
| Automation | CRUD + templates | Bounded missions, scanner, router with retry/fallback/attempt trail |
| Cost model | Single-instance SaaS (Render) | Serverless free tier + free AI routes (BYOK keys) |
| Extensibility | Monolithic routes | Adapter contract v1, capability graph, 24 categories |

## Conclusion

The Render deployment is a CRUD dashboard with template-based listing generation and placeholder data dressed in strong marketing. We match its feature map — scanner, trending, sellers, generator, keywords, profit, watchlist — with real computation, evidence gating, bounded execution, and truthful states. We do not copy its data-quality failures or its eBay-scraping claim.
