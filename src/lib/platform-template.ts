/**
 * System-managed platform template store.
 *
 * This store is the source of truth for the default catalog cloned into
 * every newly-created customer store. It is NOT a customer store and is
 * marked `active=false` so it never appears in the public marketplace.
 *
 * Platform admins can impersonate this store from the Super-Admin bar to
 * edit categories, products and add-ons — changes propagate to all
 * future stores created on the platform.
 */
export const PLATFORM_TEMPLATE_STORE_ID = "11111111-1111-1111-1111-111111111111";
