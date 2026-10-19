/** Pipeline stages in order; "lost" sits outside the forward path. */
export const LEAD_STAGES = ["intro_call", "analysis_done", "offer_sent", "accepted", "lost"] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];
