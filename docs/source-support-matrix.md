# AiBay Source Support Matrix

## Purpose

AiBay imports product information only through **authorized, attributable acquisition paths**. This matrix is a release gate for every source adapter. A new source cannot move into production simply because its page can be read; it must have a documented access mode, field coverage, test fixtures, health checks, policy review, and a manual fallback.

| Source class | Initial support status | Acquisition path | Fields accepted | User experience when unavailable |
| --- | --- | --- | --- | --- |
| eBay US market research | Supported after eBay Developer credentials are configured | Official eBay Browse API, using user-supplied or normalized search terms. | Active-item title, item URL, image, price, currency, condition, seller/feedback information only when returned, shipping where returned, and search query provenance. | The product workspace remains available. The market panel displays a credentials/availability status and can show a clearly marked demo fixture in development only. |
| Manufacturer product page | Supported when public and parseable | Bounded server-side fetch of the user-provided HTTPS URL; canonical metadata, Open Graph, JSON-LD, and visible product facts are parsed. | Product name, brand, GTIN/MPN, price, description, images, structured attributes, and only evidence-supported variants. | The import is marked incomplete and opens a field-level manual evidence form. |
| Retailer or marketplace product page | Metadata-only pilot support, subject to source policy | Same bounded public-page parsing path. No login, CAPTCHA, bot-control bypass, or privileged API. | Only fields exposed in permitted structured or visible page data. | The user is told that this source cannot be automatically imported and may paste/export their own product data. |
| Login-required, CAPTCHA-gated, rate-limited, or explicitly blocked page | Not automatically imported | No bypass, no stealth browsing, no proxy-rotation evasion, and no CAPTCHA-solving service. | None beyond the URL and the failure evidence. | A transparent source-health card presents the safe alternatives: manufacturer page, approved API, user-provided file, or manual form. |
| User-owned source evidence | Supported | Direct file upload or in-app manual entry with origin/rights acknowledgement. | Product fields, documents, images, and listing notes attributable to the user. | The product remains editable; values are tagged as user-supplied. |

## Extraction Evidence Contract

Each extracted value is saved with its normalized value, source URL, collection timestamp, extractor name, method, source snippet or JSON path, and a confidence value. Derived values must identify their parent evidence. Values that are unknown or inconsistent remain **unknown** or **conflicting**; they are never filled by unsupported inference.

| Field state | Meaning | Optimization behavior |
| --- | --- | --- |
| Verified | Present in structured data, the visible page, an approved API, or user-provided evidence. | Eligible for listing content and item-specific recommendations. |
| Derived | Deterministically normalized from verified evidence, such as a parsed brand/model pair. | May be used only with a link to the parent evidence. |
| Needs review | Ambiguous, conflicting, partially complete, or user-edited without supporting document. | Rendered visibly and excluded from unsupported factual claims. |
| Unknown | No credible evidence is present. | Not used in listing output. |

## eBay Listing Rules Enforced by the Product

AiBay creates a **reviewable listing draft**, not an autonomous publication. Titles are hard-limited to 80 characters and blocked when they contain unsupported claims, competitor names, prohibited filler, or repetitive keyword stuffing. The system retains an immutable product and market snapshot for every optimization run so an output can be audited after the source page changes.

## Image and Document Rights Gate

Before an image derivative is generated or placed in an export bundle, the user must affirm that they have the right to use the source image. The derivative record retains the original asset reference, source hash, requested transformation, output dimensions, and review state. The application does not automatically replace originals, publish altered imagery, or generate visuals that change product identity, labels, materials, dimensions, included items, or condition.

## Adapter Admission Checklist

A source adapter is eligible for the supported list only after all six controls are complete: a written source-access decision; a documented set of returned fields; redacted fixtures for clean, incomplete, and blocked examples; a timeout/rate-limit/cache policy; provenance tests; and a manual fallback flow. The production release owner must be able to disable a single adapter without affecting existing products or eBay research.
