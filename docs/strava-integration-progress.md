# Strava integration progress

Last updated: 2026-10-30.

## Product and policy decision

RunSensei remains a local-first tracker. Strava is optional and never blocks startup or recording.

The requested data flow—permanently storing Strava activities and using them to recommend a personalized plan—is **not enabled**. The Strava API Policy effective 2026-06-01 restricts competitive applications, AI operation, analytics/combining Strava data with other customer data, persistent indexes, and caches longer than seven days. Written clarification/authorization is required before enabling any Strava-dependent planning feature.

Official sources checked on 2026-10-30:

- https://www.strava.com/legal/api_policy
- https://www.strava.com/legal/api
- https://developers.strava.com/docs/getting-started/
- https://developers.strava.com/docs/authentication/
- https://supabase.com/docs/guides/functions
- https://supabase.com/docs/guides/functions/secrets

## Repository audit

- Supabase is the only existing cloud/auth provider. Firebase is absent.
- No `supabase/` Edge Function or migration project existed before this work.
- Tracker-only mode deliberately avoids initializing Supabase at startup.
- Existing local guest recordings and account-owned records are isolated.
- No Strava credentials, tokens, activities, or cache tables exist in the app database.

## Implemented technical foundation

- Independent flags: `EXPO_PUBLIC_STRAVA_ENABLED`, development-only `EXPO_PUBLIC_STRAVA_MOCK`, and hard-disabled activity-viewer/personalization capabilities.
- Settings → Connected apps → Strava screen with disabled, account-required, connecting, connected, limited/reconnect-ready contract states.
- Client gateway invokes only named Supabase Edge Functions. It never calls Strava directly and never handles a client secret or refresh token.
- OAuth completion accepts only an opaque one-time ticket on the expected app callback. Access tokens in a deep link are rejected.
- Disconnect is a server operation and must revoke access and purge permitted transient data without deleting independent RunSensei recordings.
- Domain guard rejects `strava` as a planning-data source.
- Development mock mode is visibly labelled and does not contact Strava.

## Not implemented / blocked

- No Strava app client ID or secret has been supplied.
- No controlled HTTPS callback domain exists.
- No Edge Functions or server database/RLS have been created or deployed.
- No real athlete OAuth test has been performed.
- No activity endpoint, webhook, cache, or activity import is implemented.
- No Strava data is stored or used for analytics, AI, or plan recommendations.
- Scaling beyond Strava's initial developer access requires Strava review and is not guaranteed.

## Required server work after approval and credentials

1. Create authenticated `strava-start`, public validated `strava-callback`, authenticated `strava-status`, and authenticated `strava-disconnect` Edge Functions.
2. Store `STRAVA_CLIENT_ID` and `STRAVA_CLIENT_SECRET` only as Supabase Edge Function secrets.
3. Add expiring, hashed, single-use OAuth state and completion-ticket records with RLS/admin-only access.
4. Encrypt/secure connection credentials, atomically rotate refresh tokens, and prevent one athlete linking to multiple accounts.
5. Implement revoke and deletion paths before any real connection is enabled.
6. Obtain a written decision from Strava about RunSensei's tracker overlap and proposed data use before activity viewing or personalization.

## Feature-gate behavior

- Default: Strava connection UI explains that the integration is unavailable pending review/configuration.
- `EXPO_PUBLIC_STRAVA_MOCK=true` in a development build: exercises connect/disconnect UI with no real account or data.
- `EXPO_PUBLIC_STRAVA_ENABLED=true`: enables calls to the expected server functions but still does not enable activity viewing or personalization.
