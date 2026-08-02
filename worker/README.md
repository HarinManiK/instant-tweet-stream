# Tweet Stream Worker

Long-running Node service. Connects to X filtered stream when triggered from the website and writes tweets to Firestore.

## Deploy to Render.com

1. Create a new GitHub repo (e.g. `tweet-stream-worker`) and upload these files:
   - `index.js`
   - `package.json`
   - `README.md`
2. Go to [render.com](https://render.com) → **New +** → **Web Service** → connect the repo.
3. Settings:
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node index.js`
   - **Instance Type:** Starter ($7/mo). Free tier sleeps, which breaks the stream.
4. Add environment variables (Settings → Environment):
   - `X_BEARER_TOKEN`. From developer.x.com → your project → Keys and tokens → Bearer Token.
   - `FIREBASE_PROJECT_ID`. From the Firebase console.
   - `FIREBASE_SERVICE_ACCOUNT_JSON`. Paste the entire contents of the JSON file you downloaded from Firebase → Project Settings → Service Accounts → Generate new private key.
5. Deploy. Open the live URL → should show `Tweet Stream Worker OK`. Logs should say `Worker started. Waiting for stream_state/main…`

## Local testing (optional)

```bash
cd worker
npm install
export X_BEARER_TOKEN="..."
export FIREBASE_PROJECT_ID="..."
export FIREBASE_SERVICE_ACCOUNT_JSON='{...}'
node index.js
```
