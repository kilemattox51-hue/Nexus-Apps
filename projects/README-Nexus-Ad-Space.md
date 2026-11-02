# Nexus Ad Space starter (working title)

This pull request establishes an isolated project record for the new Tauri 2 + Vite advertising app. It does not replace or modify the Nexus Store project already on `main`.

## Starter scope

The locally supplied source archive contains:
- persistent left navigation and a central searchable ad feed;
- image, video, and text placement preview cards;
- category, format, and saved-placement filters;
- subdued charcoal/plum surfaces and purple fog behind content;
- an SVG-first app mark;
- separate ad-provider and Google desktop OAuth configuration files.

## Integration state

The ad vendor is intentionally unselected. Preview cards are shown until a provider endpoint is configured. Google OAuth is staged but disabled; a Desktop OAuth client ID and native PKCE loopback callback/token handling are still required. Do not place a client secret in the distributed app.

Exact brand palette hex codes and final app name remain provisional. The complete starter source is provided separately as the local project archive in this conversation; it is not included as a binary in this branch.

## Local validation

`npm run check` and JavaScript syntax checks pass. A Vite production build and native Tauri build have not yet been completed in the current environment.
