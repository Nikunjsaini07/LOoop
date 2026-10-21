# Local Clerk authentication

Readwell uses @clerk/react for sign-in/session restoration and @clerk/backend
to verify session tokens in the Workers API. It does not use ChatGPT identity
headers. Public pages render without signing in; profile requests use a fresh
Clerk bearer token. The secret key stays on the server.

Put these settings in the ignored .env.local, then restart npm run dev:

    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=<Clerk development publishable key>
    CLERK_SECRET_KEY=<Clerk development secret key>
    CLERK_AUTHORIZED_PARTIES=http://127.0.0.1:5173,http://localhost:5173

Use /sign-in or the account control on /profile. Login methods are configured
in the Clerk Dashboard. The forms retain the destination article or profile.
Hover or tap Profile in the header to open View profile and Sign out. The dropdown
also supports keyboard focus, Arrow Down, Escape and outside-click dismissal. Signed-out navigation
shows Sign in instead of Profile. Direct signed-out visits to /profile redirect
to sign-in; no guest profile or placeholder identity is rendered. Guest visits
do not fetch /api/profile or create a browser profile. Bookmarking, logging reads, following companies
and customizing a feed require sign-in; the return page is preserved. Public
article browsing and community totals remain available without an account.

Clerk restores sessions and refreshes tokens. Readwell waits for that identity
before loading an account profile. Public browsing uses the server-rendered
edition immediately, without waiting for Clerk or refetching the same edition. Changing sessions remounts the reading UI,
cancels pending profile requests, and preserves each account's separate device
copy. The API still checks profile ownership and database versions on writes.

D1 remains the source of reading profiles, bookmarks, follows and read logs,
keyed by Clerk's verified user ID. Existing ChatGPT-owned rows and guest device
copies are retained but **not automatically merged** into Clerk accounts.
Mapping old accounts requires explicit identity verification.

For your eventual standalone host, configure the same server secrets, the live
Clerk publishable key, and an explicit list of your real HTTPS origins in
CLERK_AUTHORIZED_PARTIES. Never derive that allowlist from an incoming Host
header. Optionally set CLERK_JWT_KEY to Clerk's PEM public key for networkless
verification. No deployment is performed by this setup.

Focused checks:

    node --experimental-strip-types --test lib/server/auth.test.mjs lib/useReadingProfile.test.mjs
    npx tsc --noEmit

A real browser sign-in is still required to check your instance's configured
login providers and account synchronization end to end.

The local development preview suppresses Clerk's visual development warning
using its supported appearance option. This is presentation only: the configured
test instance and its security behavior are unchanged. The option is disabled in
production builds. Configure live credentials and the real domain for public use.
