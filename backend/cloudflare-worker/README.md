# GitHub-backed Nexus Store download counter

The desktop app sends one event per successful download/install action to this Worker. The Worker keeps the GitHub token server-side, reads the latest downloads.json, writes the increment with the current Git blob SHA, and returns the confirmed per-app total.

## Repository state and baseline migration

The catalog settings are:
- Owner: kilemattox51-hue
- Repository: Nexus-Apps
- Branch: main
- Counter file: downloads.json at the repository root

The connected repository was inspected before setup. It currently contains three app ZIPs and no downloads.json. The repository's commit history also has no earlier downloads.json version. The supplied source archive has only an empty starter template, so historical totals cannot be recovered from GitHub.

The Worker is deliberately protected against resetting a cached count. While downloads.json is missing:
- GET /counts returns bootstrapRequired: true, an empty apps object, and no-store headers.
- The frontend preserves its existing local count cache and pending event queue.
- POST /increment returns HTTP 409 with bootstrap_required: true. It does not create a zero baseline or acknowledge the event.

Before accepting downloads, create downloads.json in the root of Nexus-Apps with confirmed historical totals. Use this format, replacing the sample app key and count with verified values:

    {
      "schemaVersion": 1,
      "updatedAt": null,
      "apps": {
        "your-app-id": 42
      },
      "recentEvents": []
    }

Do not seed guessed values. If you confirm there are no historical totals to retain, create the same file with "apps": {} as an explicit zero baseline. The Worker will not assume an absent file means zero.

## GitHub and Cloudflare setup

Create these three repository secrets in Nexus-Apps → Settings → Secrets and variables → Actions:

| Secret | Value |
| --- | --- |
| CLOUDFLARE_API_TOKEN | Cloudflare API token scoped to the account with Edit Cloudflare Workers permission |
| CLOUDFLARE_ACCOUNT_ID | The Cloudflare account ID where the Worker should be deployed |
| NEXUS_APPS_GITHUB_TOKEN | Fine-grained GitHub token restricted to Nexus-Apps with Contents: Read and write |

Neither token belongs in the repository or desktop application. The workflow maps NEXUS_APPS_GITHUB_TOKEN to a Cloudflare Worker Secret named GITHUB_TOKEN.

After adding the secrets, open Actions → Deploy Nexus Store download counter → Run workflow. The manual-only workflow deploys nexus-store-download-counter and installs its server-side GitHub token. The action output includes the deployed Worker URL.

The workflow does not run on ordinary catalog changes.

## Configure Nexus Store

Copy the exact deployed workers.dev URL from the successful workflow output. In the desktop app config.js, set counterApiUrl to that exact URL, without a trailing slash and without /counts or /increment. Keep the GitHub token out of config.js, rebuild the desktop app, and distribute the updated build.

## API

- GET /counts returns authoritative app totals and acknowledged event IDs with Cache-Control: no-store. If the ledger is absent, it returns bootstrapRequired: true.
- POST /increment accepts an app_id and stable event_id. It returns the app count and whether the event was a duplicate.
- Acknowledged event IDs are retained indefinitely. A retry with the same ID does not increment again.
- Concurrent writes reread the GitHub file after SHA conflicts and retry, preventing lost updates.
- The frontend sends events serially, removes only acknowledged events, and retains the same event ID across retries.

## Live verification

After deployment and config.js setup, run verify-counter-live.mjs from the Nexus Store source tree. It creates a test entry under nexus-counter-live-test and verifies that replaying the same ID increments only once.

The normal frontend and Worker test suites use mocks; they do not write to the live GitHub repository.

## Operational note

The endpoint is callable by desktop clients and never exposes its GitHub write token. CORS is not authentication. Configure Cloudflare rate limiting for POST /increment and monitor Worker logs before public launch. The retained event ledger grows over time; a transactional Cloudflare D1 ledger is a better long-term fit for high-volume usage.
