# Account-first authentication

RunSensei requires a Google-backed Supabase session before any tracker, history, plan, or onboarding route can open. The mobile client uses Supabase OAuth PKCE and returns through `aisensei://auth/callback`.

## Data boundaries

- Supabase refresh tokens use Expo SecureStore (Android Keystore / iOS Keychain), not SQLite.
- Existing plaintext `app_settings` entries beginning `supabase:` are deleted on the next app start. They are intentionally **not** migrated; affected users sign in again.
- Local plans, logs, tracking sessions, fitness drafts, reminders, exports, and deletes are scoped to the authenticated user ID.
- Pre-account local data is preserved but is never silently claimed by a Google account.

## Database deployment

Deploy `supabase/migrations/202611050001_accounts_and_onboarding.sql` with the project-linked Supabase CLI. It creates `profiles` and `onboarding_progress`, enables RLS, provides owner-only reads, and exposes security-definer RPCs for creating/updating the current account's rows. Test with two real test accounts: account B must receive no rows belonging to account A.

The optional account-deletion endpoint is `supabase/functions/delete-account/index.ts`. It must be deployed as a Supabase Edge Function. Its service-role key remains only in the Supabase Function environment.

## Required Supabase / Google configuration

1. Enable Google under **Authentication → Providers** in Supabase.
2. Add `aisensei://auth/callback` to Supabase **Authentication → URL Configuration → Redirect URLs**.
3. In Google Cloud, configure the Android OAuth client for package `com.aisensei.app` and the signing-certificate SHA-1 used by the installed build.
4. Apply the migration, deploy the deletion function if offering account deletion, and test OAuth on a development build and release-equivalent build.

No Google password, service-role key, or OAuth client secret belongs in the app or repository.

## Native build

`expo-secure-store` adds a native module. Rebuild the Android development or release build after pulling this change; a Metro reload alone cannot add it to an already-installed binary.

## Current limits

- Privacy Policy and Terms links are deliberately not shown until approved URLs are supplied.
- Completion stores account-owned onboarding progress but does not activate a coaching plan; the existing draft-policy gate remains in force.
- Live migration/RLS/OAuth/device checks require the deployed Supabase project and a real Android build.
