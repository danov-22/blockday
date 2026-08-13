# Blockday

Blockday is a calm, self-hostable time-blocking planner for daily schedules, weekly routines, brainstorm notes, and momentum tracking.

## Features

- Day, week, and month planning views
- Editable time blocks with categories and completion states
- Brainstorm room with quick-note capture
- Convert ideas into scheduled blocks
- Saved habit templates for one-tap routines
- Daily notes, completion percentage, and streaks
- Browser reminder support
- Light and dark themes
- Optional lock for private in-app writing
- Optional Google Sheets sync through Apps Script

## Self-hosting

This app is designed to be exported as static files. Build it with:

```bash
pnpm --filter @workspace/blockday run build
```

Upload `dist/public` to a static web host. The Google Sheets connector and setup steps are in `google-apps-script/SETUP.md`.