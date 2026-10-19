/** Service groups of the quote and how many ✓ points each has (keys under offer.group.*). */
export const OFFER_GROUPS = { internal: 5, teamApp: 2, web: 2, ops: 5 } as const;
export type OfferGroup = keyof typeof OFFER_GROUPS;

export function isOfferGroup(key: string): key is OfferGroup {
  return key in OFFER_GROUPS;
}
