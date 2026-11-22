# Project Memory

## Core
Platform Model Store ID: 11111111-1111-1111-1111-111111111111 (PLATFORM_TEMPLATE_STORE_ID). System-owned (owner_user_id=NULL, active=false). Source of truth for default catalog cloned into every new store.
Template storage assets live under `product-images/template/*` and are protected by RESTRICTIVE RLS — only service_role can DELETE/UPDATE them. Never put per-store files there.
To regenerate or replace template images: scripts/upload-template-images.mjs (run with `bun`) — uses SUPABASE_SERVICE_ROLE_KEY to upsert and sync product/addon rows.
