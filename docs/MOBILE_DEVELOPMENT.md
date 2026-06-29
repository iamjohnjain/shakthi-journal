# Mobile Development

Test the app on your phone from your development machine without deploying.

## Quick start

```bash
npm run mobile
```

Vite starts in host mode and prints two URLs:

```
  VITE v6.x.x  ready in 300ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: http://192.168.1.42:5173/
```

Open the **Network** URL on your phone. Both your Mac and phone must be on the same Wi-Fi network.

---

## How it works

`npm run mobile` is an alias for `vite --host`. Vite binds to `0.0.0.0` (all interfaces) instead of just `127.0.0.1`, making it reachable from other devices on the local network.

The `vite.config.ts` already has `server: { host: true }` so `npm run dev` also binds to all interfaces. `npm run mobile` is just a named alias to make the intent explicit.

---

## Testing checklist

- [ ] Navigation works (sidebar, back buttons)
- [ ] Tap targets are large enough (aim for ≥ 44pt)
- [ ] Modals scroll correctly on small screens
- [ ] Keyboard doesn't cover inputs (use `env(safe-area-inset-*)`)
- [ ] Workout logger timer bar visible
- [ ] Water logging buttons respond to tap
- [ ] Today brief card readable at 390px width
- [ ] Export backup downloads on iOS Safari

---

## iPhone Add to Home Screen

Testing via the Network URL gives you a near-PWA experience. To install:

1. Open the Network URL in **Safari** on iPhone.
2. Tap the **Share** button (box with arrow).
3. Scroll down → **Add to Home Screen** → **Add**.

The app opens fullscreen with no browser chrome.

> **Note on icons:** `public/icon-192.png` and `public/icon-512.png` are placeholder solid-color squares. For a proper home screen icon, generate real icons using [realfavicongenerator.net](https://realfavicongenerator.net) and replace those files.

---

## Troubleshooting

**Can't reach the Network URL on my phone**

- Confirm both devices are on the same Wi-Fi network.
- Check for a Mac firewall rule blocking port 5173 (System Preferences → Network → Firewall → Options).
- Try `npx vite --host 0.0.0.0` explicitly.

**App shows "cannot connect to server"**

- The dev server needs to keep running. Don't close your terminal.
- Hot module reload (HMR) works over the network URL — changes appear on your phone in real time.
