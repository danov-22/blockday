# Blockday + Google Sheets

Blockday works offline first and stores the current planner in the browser. This optional sync turns a Google Sheet into a portable backup and lets you move your data between devices.

## 1. Create the sheet

1. Create a new blank Google Sheet.
2. Name it something like `Blockday data`.
3. Open **Extensions → Apps Script**.
4. Delete the starter code and paste the contents of `Code.gs`.
5. Run `setupSheets` once from the Apps Script editor and approve the Google permissions.

The script creates five tabs:

- `Blocks` — scheduled time blocks
- `Ideas` — quick notes and brainstorm items
- `DailyNotes` — notes attached to a date
- `Routines` — saved habit/template blocks
- `Settings` — sync and preference records

Each row stores one JSON record. This keeps the sheet easy to back up while allowing the web app to evolve without breaking old columns.

## 2. Deploy the Web App

1. In Apps Script, select **Deploy → New deployment**.
2. Choose **Web app**.
3. Set **Execute as** to **Me**.
4. Set **Who has access** to **Anyone with the link**.
5. Click **Deploy** and copy the Web app URL.
6. In Blockday, open **Settings → Google Sheets sync**, paste the URL, and save.

The URL should end in `/exec`. Use the health check below to verify it:

```text
YOUR_WEB_APP_URL?action=health
```

## 3. Google account login

The sheet sync is intentionally plain HTML/CSS/JavaScript compatible. A static site cannot safely perform Google account login without an OAuth client configured for the domain where you host it.

For a personal sheet, the simplest safe setup is to keep the Web App URL private and use one browser profile. Blockday uses a browser-generated user ID so multiple profiles can share one sheet without overwriting each other.

For a true “Sign in with Google” experience:

1. Create a Google Cloud OAuth Web application client for your hosting domain.
2. Add the Google Identity Services script to `index.html`.
3. Validate the returned ID token in a small server or in a restricted Apps Script endpoint.
4. Pass the validated Google `sub` value as the Blockday `userId`.

Do not treat a user-entered email address as proof of identity.

### Activate Blockday's prepared Google login

1. In Google Cloud Console, configure the OAuth consent screen.
2. Create an **OAuth client ID** with application type **Web application**.
3. Add `https://blockday.vercel.app` as an **Authorized JavaScript origin**.
4. Copy the client ID into `Blockday-site/auth-config.js`.
5. In Apps Script, open **Project Settings → Script properties** and add:
   - Property: `OAUTH_CLIENT_ID`
   - Value: the same OAuth Web client ID
6. Replace the deployed Apps Script code with the updated `Code.gs`, then create a new deployment version.

Once `OAUTH_CLIENT_ID` is present, Apps Script validates every Google ID token and uses its stable `sub` claim as the Sheet user key. A caller-provided email address or user ID cannot select another account's records.

After validation, Apps Script issues a signed Blockday session lasting 180 days. This lets returning users open the installed app without repeating Google login every time. Signing out removes that device's stored session.

Google login identifies the user; it does not by itself grant access to that user's Google Sheets. Blockday supports either:

- one owner-managed Sheet with securely separated rows per Google account; or
- one Sheet per user, where each user copies `Code.gs` into their own Sheet, deploys it, and pastes their `/exec` URL into Blockday Settings.

Directly creating Sheets in every user's Drive would require a separate Google OAuth authorization flow with Sheets/Drive scopes and token management. Keep that separate from the sign-in step.

## 4. Locked content

The lock feature in a static browser app is a convenience privacy layer, not encryption. It prevents casual viewing while the app is open, but anyone who can inspect the browser profile or the sheet can still access stored data.

For genuinely sensitive writing, use Google Drive encryption/access controls or add a server-side encryption layer before storing records in Sheets.

## 5. Exporting Blockday

Build the app, then upload the generated contents of `dist/public` to your web host. Keep the Apps Script URL in the app's Settings page rather than hard-coding a secret into the files.
