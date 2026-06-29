# Release Checklist

Check everything below before tagging a release or sharing the URL with beta testers.

---

## Code

- [ ] `npx tsc --noEmit` — zero TypeScript errors
- [ ] `npm run build` — build succeeds, check output size is reasonable
- [ ] `npm test` — all tests pass
- [ ] No `console.log` or debug output in production paths
- [ ] No hardcoded `localhost` URLs in production code
- [ ] All mock data is labeled `[MOCK]` or similar

## Git

- [ ] Working directory is clean (`git status` shows nothing uncommitted)
- [ ] Commit message describes the release
- [ ] Branch is `main`
- [ ] Pushed to GitHub (`git push`)

## Branding

- [ ] Browser tab title: "Shakthi Journal"
- [ ] PWA short name: "Shakthi"
- [ ] `manifest.json` name: "Shakthi Journal"
- [ ] iOS home screen title: "Shakthi"
- [ ] `<meta name="description">` is accurate

## PWA & Icons

- [ ] `public/manifest.json` is valid (validate at [web.dev/manifest-best-practices](https://web.dev/articles/add-manifest))
- [ ] `public/icon-192.png` exists and is a valid PNG
- [ ] `public/icon-512.png` exists and is a valid PNG
- [ ] `public/icon.svg` exists
- [ ] `<link rel="apple-touch-icon">` points to `/icon-192.png` (PNG, not SVG)
- [ ] `public/_redirects` contains `/* /index.html 200`
- [ ] `public/_headers` exists with caching rules

## Deployment (Cloudflare Pages)

- [ ] Build succeeded in Cloudflare dashboard
- [ ] Production URL is accessible
- [ ] Refreshing `/settings` does not return 404
- [ ] Network tab: HTML is `no-cache`, JS/CSS assets have `immutable` headers
- [ ] No mixed content warnings (all resources are HTTPS)

## Functional smoke test

- [ ] Today screen loads
- [ ] Workouts page loads
- [ ] Log modal opens and closes
- [ ] Nutrition page loads
- [ ] Settings → Backup & Restore → Export downloads a file
- [ ] Import the downloaded file successfully (Merge mode)
- [ ] IndexedDB data persists across reload

## iPhone Safari

- [ ] App loads and renders correctly
- [ ] Add to Home Screen works
- [ ] Installed PWA opens fullscreen
- [ ] Export backup works on iOS Safari

---

## Release notes template

```
## v0.X.0 — YYYY-MM-DD

### What's new
- 

### Fixed
- 

### Known issues
- 

### Upgrade notes
- No data migration needed / Export a backup before upgrading
```

---

## Post-release

- [ ] Tell beta testers the new URL or that the app has updated
- [ ] Export a backup of your own data for safekeeping
- [ ] Note the release date in `CHANGELOG.md` (if maintained)
