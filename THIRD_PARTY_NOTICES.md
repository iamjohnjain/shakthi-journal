# Third-Party Notices

Jeevan is built with the following open-source software. This list is
generated from the web app's actual installed `package.json` dependency
tree (direct dependencies only — not every transitive package), each
entry's license/version/repository pulled directly from that package's own
`package.json`, not asserted from memory.

The native iOS app has **no third-party dependencies** — no CocoaPods,
no Swift Package Manager packages. It uses only Apple's own frameworks
(HealthKit, Security).

The 3D muscle-model asset has its own, separate attribution requirement
(CC BY-SA 4.0, not an OSS software license) — see
[`public/models/CREDITS.md`](public/models/CREDITS.md) and the in-app
credit at Settings → About → "3D muscle model".

| Package | Version | License | Source |
|---|---|---|---|
| @dnd-kit/core | 6.3.1 | MIT | https://github.com/clauderic/dnd-kit |
| @dnd-kit/sortable | 10.0.0 | MIT | https://github.com/clauderic/dnd-kit |
| @dnd-kit/utilities | 3.2.2 | MIT | https://github.com/clauderic/dnd-kit |
| @react-three/fiber | 8.18.0 | MIT | https://github.com/pmndrs/react-three-fiber |
| @supabase/supabase-js | 2.108.2 | MIT | https://github.com/supabase/supabase-js |
| @zxing/browser | 0.2.1 | MIT | https://github.com/zxing-js/browser |
| @zxing/library | 0.23.0 | Apache-2.0 | https://github.com/zxing-js/library |
| html-to-image | 1.11.13 | MIT | https://github.com/bubkoo/html-to-image |
| idb | 8.0.3 | ISC | https://github.com/jakearchibald/idb |
| lucide-react | 1.22.0 | ISC | https://github.com/lucide-icons/lucide |
| mammoth | 1.13.0 | BSD-2-Clause | https://github.com/mwilliamson/mammoth.js |
| motion | 14.14.0 | MIT | https://github.com/motiondivision/motion |
| pdfjs-dist | 6.5.438 | Apache-2.0 | https://github.com/mozilla/pdf.js |
| react | 18.3.1 | MIT | https://github.com/facebook/react |
| react-dom | 18.3.1 | MIT | https://github.com/facebook/react |
| react-router-dom | 7.18.6 | MIT | https://github.com/remix-run/react-router |
| three | 0.170.0 | MIT | https://github.com/mrdoob/three.js |

All listed licenses (MIT, ISC, BSD-2-Clause, Apache-2.0) permit
commercial use and redistribution without requiring Jeevan's own source
to be disclosed. None are copyleft (GPL/LGPL/AGPL) — confirmed by the
license field above for each package, not assumed from common OSS
convention.

**Regenerating this list:** this was built by reading each direct
dependency's installed `package.json` — re-run after any dependency
change rather than hand-editing stale entries. A future improvement
would be a small script (e.g. wrapping `license-checker` or an
equivalent) so this can't silently drift from `package.json`, but no
such tool is wired up yet — this file is accurate as of the commit that
introduced it, not automatically kept in sync.
