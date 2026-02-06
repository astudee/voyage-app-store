# Voyage Phone System — Claude Code Setup Instructions

## Overview

We are adding a Twilio-based IVR phone system to the voyage-app-store project. All source files are in `uploads/voice/`. Your job is to integrate them into the existing Next.js project structure.

## Files to Place

### Library files (shared utilities)
These go in the project's `lib/` directory (wherever existing lib files live):

- `uploads/voice/twiml.ts` → `lib/twiml.ts`
- `uploads/voice/phone-config.ts` → `lib/phone-config.ts`

### API route files
These go under the `app/api/voice/` directory (create it if it doesn't exist). Each file is a Next.js API route handler:

- `uploads/voice/incoming.ts` → `app/api/voice/incoming/route.ts`
- `uploads/voice/menu.ts` → `app/api/voice/menu/route.ts`
- `uploads/voice/operator.ts` → `app/api/voice/operator/route.ts`
- `uploads/voice/operator-status.ts` → `app/api/voice/operator-status/route.ts`
- `uploads/voice/directory.ts` → `app/api/voice/directory/route.ts`
- `uploads/voice/directory-route.ts` → `app/api/voice/directory-route/route.ts`
- `uploads/voice/voicemail.ts` → `app/api/voice/voicemail/route.ts`
- `uploads/voice/voicemail-complete.ts` → `app/api/voice/voicemail-complete/route.ts`
- `uploads/voice/voicemail-transcription.ts` → `app/api/voice/voicemail-transcription/route.ts`

### Reference
- `uploads/voice/env.example` — environment variables needed (do NOT commit this, just use it as reference for Vercel env vars)
- `uploads/voice/README.md` — documentation, place at `docs/phone-system.md` or similar

## Important: Fix Import Paths

The uploaded files use `@/lib/twiml` and `@/lib/phone-config` as imports. Check the project's `tsconfig.json` to see how `@/` is aliased. If the project uses `src/`, the files need to go under `src/lib/` and `src/app/api/voice/` instead. Adjust all import paths to match the project's existing pattern.

## Environment Variables

Add these to `.env.local` for local dev (and later to Vercel dashboard):

```
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_PHONE_NUMBER=+1XXXXXXXXXX
OPERATOR_PHONE_1=+13122120815
OPERATOR_PHONE_2=+12404401901
PHONE_SYSTEM_BASE_URL=https://voyage-app-store.vercel.app
```

Andrew will fill in the actual Twilio SID, auth token, and phone number values.

## Verification Steps

After placing all files:

1. Run `npm run build` (or `next build`) to confirm there are no TypeScript or import errors
2. Run `npm run dev` and verify these endpoints return XML:
   - `curl -X POST http://localhost:3000/api/voice/incoming`
   - `curl -X POST http://localhost:3000/api/voice/menu -d "Digits=1"`
   - `curl -X POST http://localhost:3000/api/voice/menu -d "Digits=0"`
   - `curl -X POST http://localhost:3000/api/voice/directory`
3. Confirm the XML responses contain valid TwiML (starts with `<?xml` and has `<Response>` tags)

## How It Works

```
Caller dials Voyage number
  → Twilio hits POST /api/voice/incoming
  → Caller hears greeting + menu options
  → Caller presses 1, 2, or 0 (or speaks)
  → Twilio hits POST /api/voice/menu with Digits or SpeechResult

  Path 1 (services): Static blurb → transfers to operator (placeholder for Phase 2 AI)
  Path 2 (directory): Lists team → caller picks → connects
  Path 0 (operator): Rings Andrew + Emma simultaneously
    → No answer → voicemail → transcribed → logged (email notification TODO)
```

## Do NOT

- Do not install the Twilio Node.js SDK — we're generating TwiML XML directly with the lightweight `twiml.ts` helper to keep the bundle small
- Do not modify any existing routes or files in the project
- Do not commit real phone numbers or API keys to the repo
