import { NextResponse } from "next/server";
import { twilioGet, getAccountSid } from "@/lib/twilio-client";

interface TwilioCall {
  sid: string;
  from: string;
  to: string;
  direction: string;
  status: string;
  start_time: string;
  end_time: string;
  duration: string;
  date_created: string;
}

interface TwilioRecording {
  sid: string;
  call_sid: string;
  duration: string;
  date_created: string;
}

interface TwilioTranscription {
  sid: string;
  recording_sid: string;
  transcription_text: string;
  status: string;
}

interface TwilioCallList {
  calls: TwilioCall[];
}

interface TwilioRecordingList {
  recordings: TwilioRecording[];
}

interface TwilioTranscriptionList {
  transcriptions: TwilioTranscription[];
}

export async function GET() {
  try {
    const accountSid = getAccountSid();

    // Fetch calls, recordings, and transcriptions in parallel
    const [callsData, recordingsData, transcriptionsData] = await Promise.all([
      twilioGet<TwilioCallList>("Calls.json", { PageSize: "200" }),
      twilioGet<TwilioRecordingList>("Recordings.json", { PageSize: "200" }),
      twilioGet<TwilioTranscriptionList>("Transcriptions.json", { PageSize: "200" }),
    ]);

    const calls = callsData.calls || [];
    const recordings = recordingsData.recordings || [];
    const transcriptions = transcriptionsData.transcriptions || [];

    // Index recordings by call_sid
    const recordingByCall = new Map<string, TwilioRecording>();
    for (const rec of recordings) {
      recordingByCall.set(rec.call_sid, rec);
    }

    // Index transcriptions by recording_sid
    const transcriptionByRecording = new Map<string, TwilioTranscription>();
    for (const tx of transcriptions) {
      transcriptionByRecording.set(tx.recording_sid, tx);
    }

    // Build unified call list
    const unified = calls.map((call) => {
      const recording = recordingByCall.get(call.sid);
      const transcription = recording
        ? transcriptionByRecording.get(recording.sid)
        : undefined;

      // Determine call status for the UI
      let uiStatus: "completed" | "missed" | "voicemail" | "no-answer" | "busy" | "failed";
      if (recording) {
        uiStatus = "voicemail";
      } else if (call.status === "completed") {
        uiStatus = "completed";
      } else if (call.status === "no-answer") {
        uiStatus = "missed";
      } else if (call.status === "busy") {
        uiStatus = "busy";
      } else if (call.status === "failed" || call.status === "canceled") {
        uiStatus = "missed";
      } else {
        uiStatus = call.status as typeof uiStatus;
      }

      return {
        sid: call.sid,
        from: call.from,
        to: call.to,
        direction: call.direction === "inbound" ? "inbound" : "outbound",
        status: uiStatus,
        duration: call.duration,
        date: call.start_time || call.date_created,
        recording: recording
          ? {
              sid: recording.sid,
              duration: recording.duration,
              url: `/api/phone/recording/${recording.sid}`,
            }
          : null,
        transcription: transcription?.transcription_text || null,
      };
    });

    return NextResponse.json({ calls: unified });
  } catch (error) {
    console.error("[phone/calls] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch calls" },
      { status: 500 }
    );
  }
}
