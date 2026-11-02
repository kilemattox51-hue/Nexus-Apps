# Nexus Ad Space starter (working title)

This branch carries an isolated Tauri 2 + Vite starter for a new advertising-space app. It does not replace or modify the Nexus Store project already on `main`.

## Source package

Extract `Nexus-Ad-Space-0.1.0.tar.gz` to work with the complete project. The source contains:
- persistent left navigation and a central searchable ad feed;
- image, video, and text placement preview cards;
- category, format, and saved-placement filters;
- subdued charcoal/plum surfaces and purple fog behind content;
- an SVG-first app mark;
- separate ad-provider and Google desktop OAuth configuration files.

## Current integration state

The ad vendor is intentionally unselected. Preview cards are shown until a provider endpoint is configured. Google OAuth is staged but disabled; a Desktop OAuth client ID and native PKCE loopback callback/token handling are still required. Do not place a client secret in the distributed app.

Exact brand palette hex codes and final app name remain provisional. See the project README and docs/INTEGRATIONS.md inside the archive.

## Local validation

`npm run check` and JavaScript syntax checks pass. A Vite production build and native Tauri build have not yet been completed in the current environment.
