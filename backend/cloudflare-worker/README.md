# Nexus Store download counter Worker

This folder contains the Cloudflare Worker that owns download-count writes. The desktop app never receives a GitHub token. The Worker stores it as a Cloudflare Worker Secret named \`GITHUB_TOKEN\`.

## Current repository state and count migration

The catalog repository is \`kilemattox51-hue/Nexus-Apps\`, branch \`main\`, counter path \`downloads.json\`.

At the time this setup was prepared, that repository did not contain \`downloads.json\`, and its Git history had no earlier version of that file. The project archive contains only an empty starter template. Therefore, there is no authoritative shared count history to import automatically.

**Before the first real download is recorded, seed the root \`downloads.json\` with the confirmed historical counts if they must be retained.** Use this format, replacing the sample keys and values with the app IDs and exact counts you can verify:

\`\`\`json
{
  "schemaVersion": 1,
  "updatedAt": null,
  "apps": {
    "your-app-id": 42
  },
  "recentEvents": []
}
\`\`\`

Do not seed guessed values. Do not create an empty zero-count file just to make the file exist: doing so could replace counts that exist only in a desktop installation's local cache. If no historical totals can be recovered, the first accepted event will initialize a new file from zero.

## One-time GitHub and Cloudflare setup

Create these three repository secrets in **Nexus-Apps → Settings → Secrets and variables → Actions**:

| Secret | Value |
| --- | --- |
| \`CLOUDFLARE_API_TOKEN\` | Cloudflare API token scoped to the account, using the **Edit Cloudflare Workers** permission |
| \`CLOUDFLARE_ACCOUNT_ID\` | The Cloudflare account ID where the Worker should be deployed |
| \`NEXUS_APPS_GITHUB_TOKEN\` | Fine-grained GitHub token restricted to this \`Nexus-Apps\` repository with **Contents: Read and write** |

Neither token belongs in this repository or in the desktop application. The workflow maps \`NEXUS_APPS_GITHUB_TOKEN\` to a Cloudflare Worker Secret named \`GITHUB_TOKEN\`.

After adding the secrets, open **Actions → Deploy Nexus Store download counter → Run workflow**. The workflow deploys \`nexus-store-download-counter\` and installs its server-side GitHub token. The action output includes the deployed Worker URL.

The workflow is manual-only. It does not deploy on every catalog change.

## Configure the desktop application

Copy the exact deployed \`workers.dev\` URL from the successful workflow output. In the desktop app's \`config.js\`, set:

\`\`\`js
counterApiUrl: "https://YOUR-DEPLOYED-WORKER-URL",
\`\`\`

Use the exact URL shown by Cloudflare, without a trailing slash or a \`/counts\` or \`/increment\` suffix. Keep the GitHub token out of \`config.js\`, rebuild the desktop app, and distribute the updated build.

## API

- \`GET /counts\` returns the authoritative app totals and acknowledged event IDs with \`Cache-Control: no-store\`.
- \`POST /increment\` accepts \`{ "app_id": "your-app-id", "event_id": "a-stable-event-id" }\`.
- Acknowledged event IDs are retained indefinitely. A retry with the same ID returns the previous count and does not increment again.
- Concurrent writes reread the GitHub file after SHA conflicts and retry, preventing lost updates.
- The frontend sends events serially, removes only acknowledged events, and retains the same event ID across retries.

## Live verification

After deploying the Worker and configuring \`counterApiUrl\`, run the project's \`verify-counter-live.mjs\` test from the Nexus Store source tree. It creates one test entry under \`nexus-counter-live-test\` and verifies that replaying the same ID increments the total only once.

The ordinary frontend and Worker test suites are mocked tests; they do not write to the real GitHub repository.

## Operational note

The endpoint accepts requests from the desktop client and does not expose its GitHub write token. CORS is not authentication. Before a public launch, configure Cloudflare rate limiting for \`POST /increment\` and monitor Worker logs. The retained event ledger grows over time; a transactional Cloudflare D1 ledger is the better long-term option for a high-volume store.
