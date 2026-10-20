# Publisher icons

Self-hosted, unchanged icons downloaded from official company sites, or from the asset CDNs linked by those sites, on 20 October 2026. All 37 configured companies are covered. Figma is retained for the existing homepage company strip.

`manifest.json` records the official source page, exact downloaded asset URL, byte count and SHA-256 digest for each file. Logos identify the original publishers; trademarks remain with their respective owners. The application does not request a third-party logo service when a reader opens a page.

The existing `safetyculture` ID and display name are preserved. Its official homepage and engineering RSS now redirect to Mitti; the included icon is the current mark served by `app.safetyculture.com`. This does not change the source subscription or article ownership.

`components/CompanyLogo.tsx` handles consistent dimensions, accessible labels and a neutral fallback if an asset fails. New sources should receive a verified local icon and a matching entry in `lib/company-logos.ts`.
