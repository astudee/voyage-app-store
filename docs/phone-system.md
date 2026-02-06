# Voyage Advisory Phone System

IVR phone system built on Twilio + Next.js (Vercel).

## What It Does

When someone calls your Voyage Advisory number:

```
Caller dials in
  → "Thank you for calling Voyage Advisory..."
  → Press 1 / "learn more"  → Services overview (Phase 2: AI receptionist)
  → Press 2 / "directory"   → Company directory (say a name or press extension)
  → Press 0                 → Rings Andrew + Emma simultaneously
                              → No answer? → Voicemail → Transcribed → Emailed
```

## File Structure

Drop these into your existing `voyage-app-store` Next.js project:

```
app/api/voice/
├── incoming/route.ts           # Main greeting + IVR menu
├── menu/route.ts               # Routes keypress/speech to the right path
├── operator/route.ts           # Simultaneous ring (Andrew + Emma)
├── operator-status/route.ts    # No answer? → voicemail
├── directory/route.ts          # Company directory menu
├── directory-route/route.ts    # Connects to selected person
├── voicemail/route.ts          # Records voicemail
├── voicemail-complete/route.ts # Thanks caller, hangs up
└── voicemail-transcription/route.ts  # Receives transcription, sends notifications

lib/
├── twiml.ts                    # Lightweight TwiML XML helper
└── phone-config.ts             # Phone numbers, directory, settings
```

## Setup

### 1. Copy files into your repo

Copy the `app/api/voice/` directory and `lib/twiml.ts` + `lib/phone-config.ts`
into your existing `voyage-app-store` project.

### 2. Set environment variables

In Vercel dashboard → Settings → Environment Variables:

```
TWILIO_PHONE_NUMBER    = +1XXXXXXXXXX   (your Twilio number)
OPERATOR_PHONE_1       = +13122120815   (Andrew)
OPERATOR_PHONE_2       = +12404401901   (Emma)
VOICEMAIL_EMAIL        = hello@voyageadvisory.com
PHONE_SYSTEM_BASE_URL  = https://voyage-app-store.vercel.app  (your Vercel URL)
```

### 3. Configure Twilio

1. Go to [Twilio Console → Phone Numbers](https://console.twilio.com/us1/develop/phone-numbers/manage/incoming)
2. Click your Voyage Advisory phone number
3. Under **Voice & Fax → A Call Comes In**:
   - Select: **Webhook**
   - URL: `https://your-vercel-app.vercel.app/api/voice/incoming`
   - Method: **HTTP POST**
4. Save

### 4. Test it

Call your Twilio number. You should hear the greeting and be able to navigate the menu.

## Costs

| Component | Cost |
|-----------|------|
| Twilio phone number | ~$1.15/month |
| Inbound voice | ~$0.0085/min |
| Voicemail transcription | ~$0.05/transcription |
| Vercel | Free tier |
| **Total for ~20 calls/month** | **~$3-5/month** |

## Phase 2: AI Receptionist

When Path 1 ("learn more") is upgraded, it will connect callers to a
ConversationRelay-powered AI that can talk about Voyage's services
using Claude. This requires a WebSocket server on Railway (see Phase 2 docs).

## Phase 3: Dashboard (Optional)

- Voicemail inbox with transcriptions
- Call log
- Admin panel for directory/settings

## Notification Options

The voicemail transcription handler (`voicemail-transcription/route.ts`) has
TODO placeholders for:

- **Email via SendGrid or Resend**
- **Slack webhook**
- **Google Apps Script webhook** (send via Gmail)

Pick whichever fits your existing Voyage workflow.
