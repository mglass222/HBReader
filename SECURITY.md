# Security notes (HBReader)

## Firebase web API key
The browser `apiKey` in `index.html` is expected to be public. Protect the project with:

1. **Authentication → Settings → Authorized domains** — only production hosting domains + `localhost`.
2. **App Check** — create a reCAPTCHA v3 provider, paste the site key into `RECAPTCHA_V3_SITE_KEY` in `index.html`, then enforce App Check on Firestore and Cloud Functions.
3. **Firestore rules** — already auth-gated in `firestore.rules`; re-deploy after changes (`firebase deploy --only firestore:rules`).
4. **Storage rules** — deploy `storage.rules` (default deny) if/when Storage is used: `firebase deploy --only storage`.

## GitHub
Secret scanning and push protection are enabled on this public repository.
