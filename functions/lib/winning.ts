// Winning-product finder — auto discovery for eBay dropshippers, zero keys.
//
// Combines live eBay public-search observations with supplier discovery to
// produce explainable winning-item candidates: demand/competition signals
// from eBay, supplier availability + price from supplier marketplaces, and a
// GROSS margin estimate (before fees/shipping — assumptions exposed).
//
// Truth rules: every number is an observation or an estimate with a label;
// blocked sources produce honest states; no fabricated listings or prices.

import { searchEbayLocal } from './ebay-scraper'
import { findSuppliers, type SupplierOffer } from './suppliers'
import { scoreOpportunity, type OpportunityInput } from './intelligence'

export type WinningItem = {
  rank: number
  title: string
  url: string
  image: string | null
  ebayPrice: number | null
  ebayCurrency: string | null
  ebaySold: number | null
  supplier: { source: string; title: string; price: number | null; currency: string | null; url: string; minOrder: string | null } | null
  grossMarginPct: number | null
  marginNote: string
  opportunity: { overall: number | null; verdict: string; components: Array<{ key: string; label: string; value: number | null; state: string }> }
  evidence: string[]
  provenance: { ebaySourceUrl: string; retrievedAt: string }
}

export type WinningFinderResult = {
  status: 'completed' | 'blocked' | 'insufficient_evidence'
  keyword: string
  scanned: number
  analyzed: number
  items: WinningItem[]
  note: string
  retrievedAt: string
}

const MAX_ANALYZE = 8

export async function findWinningItems(keyword: string, options: { maxItems?: number; matchThreshold?: number } = {}): Promise<WinningFinderResult> {
  const retrievedAt = new Date().toISOString()
  const ebay = await searchEbayLocal(keyword, 20)
  if (ebay.items.length === 0) {
    return { status: 'insufficient_evidence', keyword, scanned: 0, analyzed: 0, items: [], note: ebay.note + ' No eBay listings were available to analyze.', retrievedAt }
  }
  const analyzed = ebay.items.slice(0, Math.min(MAX_ANALYZE, options.maxItems ?? MAX_ANALYZE))
  const items: WinningItem[] = []
  const notes: string[] = []

  for (let index = 0; index < analyzed.length; index += 1) {
    const listing = analyzed[index]
    const supplierResult = await findSuppliers({ title: listing.title }, { matchThreshold: options.matchThreshold ?? 40 })
    const matched = supplierResult.offers.filter((offer) => offer.matched && offer.price != null)
    const cheapest = matched.length ? matched.reduce<SupplierOffer>((best, offer) => (offer.price != null && (best.price == null || offer.price < best.price) ? offer : best), matched[0]) : null
    const ebayPrice = listing.price
    const grossMarginPct = ebayPrice && cheapest?.price != null && ebayPrice > 0 ? Math.round(((ebayPrice - cheapest.price) / ebayPrice) * 100) : null

    const opportunityInput: OpportunityInput = {
      productTitle: listing.title,
      observedPrice: ebayPrice,
      supplierPrice: cheapest?.price ?? null,
      listings: [{ price: ebayPrice ?? undefined, soldVolume: listing.soldCount ?? undefined, title: listing.title }],
      keywordCount: null,
      sources: 2,
    }
    const opportunity = scoreOpportunity(opportunityInput)
    const evidence = [
      `eBay listing observed at ${ebayPrice != null ? `${ebayPrice} ${listing.currency ?? 'USD'}` : 'no price'}`,
      ...(listing.soldCount != null ? [`${listing.soldCount} sold shown on the listing`] : ['no sold count visible']),
      ...(cheapest ? [`supplier ${cheapest.sourceLabel} at ${cheapest.price} ${cheapest.currency ?? ''}`.trim()] : ['no matching supplier offer found']),
      ...(grossMarginPct != null ? [`gross margin ~${grossMarginPct}% BEFORE fees/shipping`] : []),
    ]
    items.push({
      rank: index + 1,
      title: listing.title,
      url: listing.url,
      image: listing.image,
      ebayPrice,
      ebayCurrency: listing.currency,
      ebaySold: listing.soldCount,
      supplier: cheapest ? { source: cheapest.sourceLabel, title: cheapest.title, price: cheapest.price, currency: cheapest.currency, url: cheapest.url, minOrder: cheapest.minOrder } : null,
      grossMarginPct,
      marginNote: grossMarginPct != null ? `Gross margin estimate (before fees/shipping): ${grossMarginPct}%.` : 'Margin requires both an eBay price and a matched supplier price.',
      opportunity: { overall: opportunity.overall, verdict: opportunity.verdict, components: opportunity.components.map((component) => ({ key: component.key, label: component.label, value: component.value, state: component.state })) },
      evidence,
      provenance: { ebaySourceUrl: listing.url, retrievedAt },
    })
    if (supplierResult.offers.length === 0 && supplierResult.note) notes.push(supplierResult.note.split(' ').slice(0, 12).join(' '))
  }

  const sorted = items.sort((a, b) => (b.opportunity.overall ?? 0) - (a.opportunity.overall ?? 0))
  const withMargin = sorted.filter((item) => item.grossMarginPct != null && item.grossMarginPct > 0)
  return {
    status: 'completed',
    keyword,
    scanned: ebay.items.length,
    analyzed: sorted.length,
    items: sorted,
    note: [
      `Scanned ${ebay.items.length} eBay listing(s) for "${keyword}", analyzed ${sorted.length}.`,
      withMargin.length ? `${withMargin.length} candidate(s) show a positive gross margin (before fees).` : 'No candidate showed a positive gross margin — review fees before acting.',
      'All values are observations or estimates; fees, shipping, and returns are NOT included. Blocks are reported truthfully.',
    ].join(' '),
    retrievedAt,
  }
}
