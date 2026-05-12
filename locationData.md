# Temporary Location Mapping

This file documents a temporary hardcoded location setup for app filtering in the portal.
It is intended as a short-term fallback until the final per-client backend location setup is fully available.

## Hardcoded Location Set (8)

- Thrissur
- Kochi
- Delhi
- Mumbai
- Chennai
- Bangalore
- Hyderabad
- Coimbatore

## Applied To

The following application entries in `src/App.tsx` currently use this hardcoded set:

- `VITE_APP_HR_URL`
- `VITE_APP_SALES_URL`
- `VITE_APP_WAREHOUSE_URL`
- `VITE_APP_FINANCE_URL`

## Where Configured

- Constant: `TEMP_APPLICATION_LOCATIONS`
- File: `src/App.tsx`

## Removal Plan (Later)

When backend per-client locations are finalized:

1. Remove `TEMP_APPLICATION_LOCATIONS` from `src/App.tsx`.
2. Replace each app's `locations` with exact backend-driven locations.
3. Keep frontend filtering based on token/client claims as source of truth.

