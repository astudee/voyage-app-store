"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { AppLayout } from "@/components/app-layout";
import {
  Phone,
  Voicemail,
  MessageSquare,
  List,
  Users,
  Settings,
  Search,
  Play,
  Pause,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Send,
  ChevronDown,
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────
interface CallRecord {
  sid: string;
  from: string;
  to: string;
  direction: "inbound" | "outbound";
  status: "completed" | "missed" | "voicemail" | "no-answer" | "busy" | "failed";
  duration: string;
  date: string;
  recording: { sid: string; duration: string; url: string } | null;
  transcription: string | null;
}

interface MessageRecord {
  sid: string;
  from: string;
  to: string;
  body: string;
  direction: "inbound" | "outbound";
  status: string;
  date: string;
  hasMedia: boolean;
}

interface DirectoryEntry {
  id?: number;
  extension: string;
  firstName: string;
  lastName: string;
  title: string;
  number: string;
  aliases?: string[];
  isActive?: boolean;
}

interface HuntGroupMember {
  name: string;
  phone: string;
  extension: string | null;
}

interface HuntGroup {
  label: string;
  description: string;
  ringTimeout: number;
  members: HuntGroupMember[];
}

interface TwilioNumber {
  sid: string;
  number: string;
  label: string;
}

interface ConfigData {
  directory: DirectoryEntry[];
  huntGroups: { sales: HuntGroup; operator: HuntGroup };
  twilioNumbers: TwilioNumber[];
  voicemailEmails: string[];
  voicemailMaxLength: number;
}

// ─── Brand Colors ───────────────────────────────────────────────
const brand = {
  navy: "#0D3B66",
  darkBlue: "#336699",
  mediumBlue: "#6699cc",
  teal: "#669999",
  tealLight: "#e8f0f0",   // teal at ~10% opacity for backgrounds
  tealMid: "#c2d6d6",     // teal at ~30% for borders
  charcoal: "#333333",
};

// ─── Utilities ──────────────────────────────────────────────────
function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (isToday) return `Today ${time}`;
  if (isYesterday) return `Yesterday ${time}`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + ` ${time}`;
}

function formatDuration(seconds: string | number): string {
  const s = typeof seconds === "string" ? parseInt(seconds) : seconds;
  if (!s || s === 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function initials(first: string, last: string): string {
  return `${first?.[0] || ""}${last?.[0] || ""}`.toUpperCase();
}

// ─── Badge ──────────────────────────────────────────────────────
function Badge({ children, variant = "default" }: { children: React.ReactNode; variant?: string }) {
  const styles: Record<string, string> = {
    default: "bg-slate-100 text-slate-700",
    green: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    red: "bg-red-50 text-red-600 border border-red-200",
    blue: "bg-[#e8f0f0] text-[#336699] border border-[#c2d6d6]",
    amber: "bg-amber-50 text-amber-700 border border-amber-200",
    purple: "bg-violet-50 text-violet-700 border border-violet-200",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${styles[variant] || styles.default}`}>
      {children}
    </span>
  );
}

// ─── Voicemail Tab ──────────────────────────────────────────────
function VoicemailTab({ calls }: { calls: CallRecord[] }) {
  const voicemails = calls.filter((c) => c.recording);
  const [selectedSid, setSelectedSid] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const selected = voicemails.find((v) => v.sid === selectedSid) || null;

  const filtered = voicemails.filter((v) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      v.from.includes(q) ||
      v.to.includes(q) ||
      (v.transcription || "").toLowerCase().includes(q)
    );
  });

  const handlePlay = () => {
    if (!selected?.recording) return;
    if (!audioRef.current) {
      audioRef.current = new Audio(selected.recording.url);
      audioRef.current.addEventListener("timeupdate", () => {
        if (audioRef.current) {
          const dur = audioRef.current.duration || 1;
          setProgress((audioRef.current.currentTime / dur) * 100);
          setCurrentTime(audioRef.current.currentTime);
        }
      });
      audioRef.current.addEventListener("ended", () => {
        setIsPlaying(false);
        setProgress(0);
        setCurrentTime(0);
      });
    }
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  // Cleanup audio on selection change
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setIsPlaying(false);
      setProgress(0);
      setCurrentTime(0);
    }
  }, [selectedSid]);

  return (
    <div className="flex h-full" style={{ minHeight: 480 }}>
      {/* List */}
      <div className="w-80 border-r border-slate-200 overflow-y-auto flex-shrink-0">
        <div className="p-3 border-b border-slate-100">
          <div className="relative">
            <span className="absolute left-2.5 top-2 text-slate-400">
              <Search size={16} />
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c2d6d6] focus:border-[#669999] bg-slate-50"
              placeholder="Search voicemails..."
            />
          </div>
        </div>
        {filtered.length === 0 && (
          <div className="p-6 text-center text-sm text-slate-400">No voicemails found</div>
        )}
        {filtered.map((vm) => (
          <div
            key={vm.sid}
            onClick={() => setSelectedSid(vm.sid)}
            className={`px-4 py-3 cursor-pointer border-b border-slate-50 transition-colors ${
              selectedSid === vm.sid ? "bg-[#e8f0f0] border-l-2 border-l-[#669999]" : "hover:bg-slate-50"
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-slate-700 truncate">
                {formatPhone(vm.from)}
              </span>
              <span className="text-xs text-slate-400 ml-2 whitespace-nowrap">{formatDate(vm.date)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">{formatDuration(vm.recording?.duration || "0")}</span>
            </div>
            {vm.transcription && (
              <p className="text-xs text-slate-500 truncate mt-1">{vm.transcription}</p>
            )}
          </div>
        ))}
      </div>

      {/* Detail */}
      <div className="flex-1 p-6">
        {selected ? (
          <div>
            <div className="flex items-start justify-between mb-6">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">{formatPhone(selected.from)}</h3>
                <p className="text-sm text-slate-500 mt-0.5">To: {formatPhone(selected.to)}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-slate-500">{formatDate(selected.date)}</p>
                <span className="text-xs text-slate-400">{formatDuration(selected.recording?.duration || "0")}</span>
              </div>
            </div>

            {/* Audio Player */}
            <div className="bg-slate-50 rounded-xl p-4 mb-6 border border-slate-200">
              <div className="flex items-center gap-3">
                <button
                  onClick={handlePlay}
                  className="w-10 h-10 rounded-full bg-[#0D3B66] text-white flex items-center justify-center hover:bg-[#336699] transition-colors"
                >
                  {isPlaying ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
                </button>
                <div className="flex-1">
                  <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#669999] rounded-full transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-xs text-slate-400">{formatDuration(Math.floor(currentTime))}</span>
                    <span className="text-xs text-slate-400">{formatDuration(selected.recording?.duration || "0")}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Transcription */}
            {selected.transcription && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Transcription
                </h4>
                <p className="text-sm text-slate-700 leading-relaxed bg-white border border-slate-200 rounded-lg p-4">
                  {selected.transcription}
                </p>
              </div>
            )}

            {!selected.transcription && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Transcription
                </h4>
                <p className="text-sm text-slate-400 italic bg-white border border-slate-200 rounded-lg p-4">
                  No transcription available
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-slate-400 text-sm">
            Select a voicemail to view
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Messages Tab ───────────────────────────────────────────────
function MessagesTab({
  messages,
  twilioNumbers,
}: {
  messages: MessageRecord[];
  twilioNumbers: TwilioNumber[];
}) {
  const [fromNumber, setFromNumber] = useState("");
  const [selectedThreadNumber, setSelectedThreadNumber] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [showFromDropdown, setShowFromDropdown] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [localMessages, setLocalMessages] = useState<MessageRecord[]>([]);
  const [showNewThread, setShowNewThread] = useState(false);
  const [newThreadNumber, setNewThreadNumber] = useState("");

  // Set default from-number when twilioNumbers arrive
  useEffect(() => {
    if (twilioNumbers.length > 0 && !fromNumber) {
      setFromNumber(twilioNumbers[0].number);
    }
  }, [twilioNumbers, fromNumber]);

  // Merge fetched + locally sent messages
  const allMessages = [...messages, ...localMessages];

  // Group messages into threads by the other party's number
  const threads: Record<string, MessageRecord[]> = {};
  for (const msg of allMessages) {
    const otherParty = msg.direction === "inbound" ? msg.from : msg.to;
    if (!threads[otherParty]) threads[otherParty] = [];
    threads[otherParty].push(msg);
  }

  const threadList = Object.entries(threads)
    .map(([number, msgs]) => ({
      number,
      messages: [...msgs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
      lastMessage: [...msgs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0],
    }))
    .sort((a, b) => new Date(b.lastMessage.date).getTime() - new Date(a.lastMessage.date).getTime());

  const selectedThread = threadList.find((t) => t.number === selectedThreadNumber) || null;

  const handleStartNewThread = () => {
    // Normalize: strip non-digits, ensure +1 prefix
    let digits = newThreadNumber.replace(/\D/g, "");
    if (digits.length === 10) digits = "1" + digits;
    if (digits.length === 11 && digits.startsWith("1")) {
      const number = `+${digits}`;
      setSelectedThreadNumber(number);
      setShowNewThread(false);
      setNewThreadNumber("");
    }
  };

  const handleSend = async () => {
    if (!newMessage.trim() || !selectedThreadNumber || !fromNumber) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch("/api/phone/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: fromNumber, to: selectedThreadNumber, body: newMessage }),
      });
      if (res.ok) {
        setLocalMessages((prev) => [
          ...prev,
          {
            sid: `local-${Date.now()}`,
            from: fromNumber,
            to: selectedThreadNumber,
            body: newMessage,
            direction: "outbound",
            status: "sent",
            date: new Date().toISOString(),
            hasMedia: false,
          },
        ]);
        setNewMessage("");
      } else {
        const data = await res.json().catch(() => ({ error: "Send failed" }));
        setSendError(data.error || `Send failed (${res.status})`);
      }
    } catch (err) {
      console.error("Failed to send:", err);
      setSendError("Network error — could not send message");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-full" style={{ minHeight: 480 }}>
      {/* Thread List */}
      <div className="w-80 border-r border-slate-200 overflow-y-auto flex-shrink-0">
        {/* From Number Selector */}
        <div className="p-3 border-b border-slate-100">
          <div className="relative">
            <button
              onClick={() => setShowFromDropdown(!showFromDropdown)}
              className="w-full flex items-center justify-between px-3 py-2 text-sm border border-slate-200 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors"
            >
              <div className="text-left">
                <span className="text-xs text-slate-400 block">Sending from</span>
                <span className="font-medium text-slate-700">
                  {fromNumber ? formatPhone(fromNumber) : "Loading..."}
                </span>
              </div>
              <ChevronDown size={14} />
            </button>
            {showFromDropdown && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-10">
                {twilioNumbers.map((n) => (
                  <button
                    key={n.sid}
                    onClick={() => {
                      setFromNumber(n.number);
                      setShowFromDropdown(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 ${
                      fromNumber === n.number ? "bg-[#e8f0f0] text-[#336699]" : ""
                    }`}
                  >
                    <span className="font-medium">{formatPhone(n.number)}</span>
                    {n.label && <span className="text-xs text-slate-400 ml-2">{n.label}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* New Message */}
        <div className="p-3 border-b border-slate-100">
          {showNewThread ? (
            <div className="space-y-2">
              <input
                value={newThreadNumber}
                onChange={(e) => setNewThreadNumber(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleStartNewThread();
                  if (e.key === "Escape") { setShowNewThread(false); setNewThreadNumber(""); }
                }}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c2d6d6] focus:border-[#669999]"
                placeholder="Phone number, e.g. (312) 555-0147"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={handleStartNewThread}
                  disabled={newThreadNumber.replace(/\D/g, "").length < 10}
                  className="flex-1 px-3 py-1.5 text-xs bg-[#0D3B66] text-white rounded-lg hover:bg-[#336699] transition-colors disabled:opacity-50"
                >
                  Start
                </button>
                <button
                  onClick={() => { setShowNewThread(false); setNewThreadNumber(""); }}
                  className="px-3 py-1.5 text-xs border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowNewThread(true)}
              className="w-full px-3 py-2 text-sm bg-[#0D3B66] text-white rounded-lg hover:bg-[#336699] transition-colors flex items-center justify-center gap-2"
            >
              + New Message
            </button>
          )}
        </div>

        {threadList.length === 0 && !selectedThreadNumber && (
          <div className="p-6 text-center text-sm text-slate-400">No messages</div>
        )}
        {threadList.map((thread) => (
          <div
            key={thread.number}
            onClick={() => setSelectedThreadNumber(thread.number)}
            className={`px-4 py-3 cursor-pointer border-b border-slate-50 transition-colors ${
              selectedThreadNumber === thread.number
                ? "bg-[#e8f0f0] border-l-2 border-l-[#669999]"
                : "hover:bg-slate-50"
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-slate-700">{formatPhone(thread.number)}</span>
              <span className="text-xs text-slate-400">{formatDate(thread.lastMessage.date)}</span>
            </div>
            <p className="text-xs text-slate-500 truncate">{thread.lastMessage.body}</p>
          </div>
        ))}
      </div>

      {/* Thread Detail */}
      <div className="flex-1 flex flex-col">
        {selectedThreadNumber ? (
          <>
            <div className="p-4 border-b border-slate-200 bg-white">
              <h3 className="text-sm font-semibold text-slate-900">{formatPhone(selectedThreadNumber)}</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
              {selectedThread && selectedThread.messages.length > 0 ? (
                selectedThread.messages.map((msg) => (
                  <div key={msg.sid} className={`flex ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-xs px-4 py-2 rounded-2xl text-sm ${
                        msg.direction === "outbound"
                          ? "bg-[#0D3B66] text-white rounded-br-md"
                          : "bg-white text-slate-700 border border-slate-200 rounded-bl-md"
                      }`}
                    >
                      <p>{msg.body}</p>
                      <p className={`text-xs mt-1 ${msg.direction === "outbound" ? "text-white/70" : "text-slate-400"}`}>
                        {formatDate(msg.date)}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center text-sm text-slate-400 py-8">
                  No messages yet — type below to start the conversation
                </div>
              )}
            </div>
            <div className="p-3 border-t border-slate-200 bg-white">
              {sendError && (
                <div className="mb-2 px-3 py-2 text-xs bg-red-50 text-red-600 border border-red-200 rounded-lg">
                  {sendError}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  value={newMessage}
                  onChange={(e) => { setNewMessage(e.target.value); setSendError(null); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c2d6d6] focus:border-[#669999]"
                  placeholder="Type a message..."
                  disabled={sending}
                />
                <button
                  onClick={handleSend}
                  disabled={sending || !newMessage.trim()}
                  className="px-4 py-2 bg-[#0D3B66] text-white rounded-lg hover:bg-[#336699] transition-colors disabled:opacity-50"
                >
                  <Send size={16} />
                </button>
              </div>
              <p className="text-xs text-slate-400 mt-1.5">
                Sending from {fromNumber ? formatPhone(fromNumber) : "..."}
              </p>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-slate-400 text-sm">
            Select a conversation or start a new message
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Call Log Tab ───────────────────────────────────────────────
function CallLogTab({ calls }: { calls: CallRecord[] }) {
  const [filter, setFilter] = useState("all");

  const filtered = calls.filter((c) => {
    if (filter === "all") return true;
    if (filter === "inbound") return c.direction === "inbound";
    if (filter === "outbound") return c.direction === "outbound";
    if (filter === "missed") return c.status === "missed" || c.status === "voicemail";
    return true;
  });

  return (
    <div className="p-4">
      {/* Filters */}
      <div className="flex gap-1 mb-4 bg-slate-100 p-1 rounded-lg w-fit">
        {[
          { key: "all", label: "All" },
          { key: "inbound", label: "Inbound" },
          { key: "outbound", label: "Outbound" },
          { key: "missed", label: "Missed / VM" },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              filter === f.key
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-8"></th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Caller / Recipient
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Number Dialed
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Queue
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Answered By
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Duration
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Date & Time
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-400 text-sm">
                  No calls found
                </td>
              </tr>
            )}
            {filtered.map((call) => (
              <tr key={call.sid} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3">
                  {call.direction === "inbound" && call.status === "completed" && (
                    <PhoneIncoming size={14} className="text-green-500" />
                  )}
                  {call.direction === "outbound" && (
                    <PhoneOutgoing size={14} className="text-[#336699]" />
                  )}
                  {call.status === "missed" && (
                    <PhoneMissed size={14} className="text-red-500" />
                  )}
                  {call.status === "voicemail" && (
                    <Voicemail size={14} className="text-amber-500" />
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">
                    {formatPhone(call.direction === "inbound" ? call.from : call.to)}
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {formatPhone(call.to)}
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs text-slate-400">&mdash;</span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs text-slate-400">&mdash;</span>
                </td>
                <td className="px-4 py-3 text-slate-600">{formatDuration(call.duration)}</td>
                <td className="px-4 py-3 text-slate-500">{formatDate(call.date)}</td>
                <td className="px-4 py-3">
                  <Badge
                    variant={
                      call.status === "completed"
                        ? "green"
                        : call.status === "voicemail"
                        ? "amber"
                        : "red"
                    }
                  >
                    {call.status}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400 mt-3">{filtered.length} calls</p>
    </div>
  );
}

// ─── Directory Tab ──────────────────────────────────────────────
function DirectoryTab({ directory: initialDirectory }: { directory: DirectoryEntry[] }) {
  const [search, setSearch] = useState("");
  const [directory, setDirectory] = useState<DirectoryEntry[]>(initialDirectory);
  const [showForm, setShowForm] = useState(false);
  const [editEntry, setEditEntry] = useState<DirectoryEntry | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<DirectoryEntry | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  // Form state
  const [form, setForm] = useState({
    extension: "",
    firstName: "",
    lastName: "",
    title: "",
    number: "",
    aliases: "",
  });

  // Fetch directory from dedicated API
  const fetchDirectory = useCallback(async () => {
    try {
      const res = await fetch("/api/phone/directory");
      if (res.ok) {
        const data = await res.json();
        setDirectory(data);
      }
    } catch (err) {
      console.error("Failed to fetch directory:", err);
    }
  }, []);

  useEffect(() => {
    fetchDirectory();
  }, [fetchDirectory]);

  const filtered = directory.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.firstName.toLowerCase().includes(q) ||
      p.lastName.toLowerCase().includes(q) ||
      p.title.toLowerCase().includes(q) ||
      p.extension.includes(q) ||
      (p.aliases || []).some((a: string) => a.toLowerCase().includes(q))
    );
  });

  function openAdd() {
    // Suggest next extension number
    const maxExt = directory.reduce((max, e) => Math.max(max, parseInt(e.extension) || 0), 500);
    setForm({
      extension: String(maxExt + 1),
      firstName: "",
      lastName: "",
      title: "",
      number: "+1",
      aliases: "",
    });
    setEditEntry(null);
    setError("");
    setShowForm(true);
  }

  function openEdit(entry: DirectoryEntry) {
    setForm({
      extension: entry.extension,
      firstName: entry.firstName,
      lastName: entry.lastName,
      title: entry.title,
      number: entry.number,
      aliases: (entry.aliases || []).join(", "),
    });
    setEditEntry(entry);
    setError("");
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditEntry(null);
    setError("");
  }

  async function handleSave() {
    setError("");

    if (!form.extension || !form.firstName || !form.lastName || !form.number) {
      setError("Extension, first name, last name, and phone number are required.");
      return;
    }

    // Basic phone validation
    if (!/^\+?\d{10,15}$/.test(form.number.replace(/[\s()-]/g, ""))) {
      setError("Please enter a valid phone number (e.g. +13125551234).");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        extension: form.extension,
        firstName: form.firstName,
        lastName: form.lastName,
        title: form.title || null,
        number: form.number.replace(/[\s()-]/g, ""),
        aliases: form.aliases.trim() || null,
      };

      const url = editEntry?.id
        ? `/api/phone/directory/${editEntry.id}`
        : "/api/phone/directory";

      const res = await fetch(url, {
        method: editEntry?.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to save.");
        return;
      }

      await fetchDirectory();
      closeForm();
    } catch (err) {
      setError("Network error. Please try again.");
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteConfirm?.id) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/phone/directory/${deleteConfirm.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await fetchDirectory();
      }
    } catch (err) {
      console.error("Failed to delete:", err);
    } finally {
      setDeleting(false);
      setDeleteConfirm(null);
    }
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="relative w-72">
          <span className="absolute left-2.5 top-2 text-slate-400">
            <Search size={16} />
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c2d6d6] focus:border-[#669999] bg-slate-50"
            placeholder="Search by name, title, or extension..."
          />
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white rounded-lg transition-colors"
          style={{ backgroundColor: brand.navy }}
        >
          <Plus size={16} />
          Add Person
        </button>
      </div>

      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Ext
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Name
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Title
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Phone
              </th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-24">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((person) => (
              <tr key={person.id || person.extension} className="border-b border-slate-100 hover:bg-slate-50 transition-colors group">
                <td className="px-4 py-3">
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 text-xs font-bold text-slate-600">
                    {person.extension}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#e8f0f0] text-[#336699] flex items-center justify-center text-xs font-bold">
                      {initials(person.firstName, person.lastName)}
                    </div>
                    <div>
                      <span className="font-medium text-slate-900">
                        {person.firstName} {person.lastName}
                      </span>
                      {person.aliases && person.aliases.length > 0 && (
                        <span className="text-xs text-slate-400 ml-1.5">
                          (aka {person.aliases.join(", ")})
                        </span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600">{person.title}</td>
                <td className="px-4 py-3 text-slate-600 font-mono text-xs">
                  {formatPhone(person.number)}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => openEdit(person)}
                      className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-[#336699] transition-colors"
                      title="Edit"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(person)}
                      className="p-1.5 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400 text-sm">
                  {search ? "No matches found." : "No directory entries yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400 mt-3">{filtered.length} of {directory.length} people shown</p>

      {/* ── Add / Edit Modal ────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h3 className="text-base font-semibold text-slate-900">
                {editEntry ? "Edit Directory Entry" : "Add Directory Entry"}
              </h3>
              <button onClick={closeForm} className="p-1 rounded-md hover:bg-slate-100 text-slate-400">
                <X size={18} />
              </button>
            </div>

            <div className="px-5 py-4 space-y-3">
              {error && (
                <div className="px-3 py-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">First Name *</label>
                  <input
                    value={form.firstName}
                    onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                    className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c2d6d6] focus:border-[#669999]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Last Name *</label>
                  <input
                    value={form.lastName}
                    onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                    className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c2d6d6] focus:border-[#669999]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Title</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c2d6d6] focus:border-[#669999]"
                  placeholder="e.g. Senior Consultant"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Extension *</label>
                  <input
                    value={form.extension}
                    onChange={(e) => setForm({ ...form, extension: e.target.value })}
                    className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c2d6d6] focus:border-[#669999]"
                    placeholder="531"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Phone Number *</label>
                  <input
                    value={form.number}
                    onChange={(e) => setForm({ ...form, number: e.target.value })}
                    className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c2d6d6] focus:border-[#669999]"
                    placeholder="+13125551234"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Aliases</label>
                <input
                  value={form.aliases}
                  onChange={(e) => setForm({ ...form, aliases: e.target.value })}
                  className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c2d6d6] focus:border-[#669999]"
                  placeholder="Comma-separated alternate names (optional)"
                />
                <p className="text-xs text-slate-400 mt-1">Used for IVR voice matching, e.g. &quot;Randy, Holly&quot;</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-200 bg-slate-50 rounded-b-xl">
              <button
                onClick={closeForm}
                className="px-4 py-1.5 text-sm text-slate-600 hover:text-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50"
                style={{ backgroundColor: brand.navy }}
              >
                <Check size={14} />
                {saving ? "Saving..." : editEntry ? "Save Changes" : "Add Entry"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ────────────────────── */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4">
            <div className="px-5 py-4">
              <h3 className="text-base font-semibold text-slate-900 mb-2">Delete Entry</h3>
              <p className="text-sm text-slate-600">
                Remove <span className="font-medium">{deleteConfirm.firstName} {deleteConfirm.lastName}</span> (ext {deleteConfirm.extension}) from the directory?
              </p>
              <p className="text-xs text-slate-400 mt-1">
                This will also remove them from the IVR phone directory.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50 rounded-b-xl">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-1.5 text-sm text-slate-600 hover:text-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors disabled:opacity-50"
              >
                <Trash2 size={14} />
                {deleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Config Tab ─────────────────────────────────────────────────
function ConfigTab({ config }: { config: ConfigData | null }) {
  if (!config) {
    return (
      <div className="p-6 text-center text-slate-400 text-sm">Loading configuration...</div>
    );
  }

  const { huntGroups, twilioNumbers, voicemailEmails, voicemailMaxLength } = config;

  const HuntGroupCard = ({ group }: { group: HuntGroup }) => (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <div className="bg-slate-50 px-5 py-4 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">{group.label} Hunt Group</h3>
            <p className="text-xs text-slate-500 mt-0.5">{group.description}</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500">Ring timeout:</label>
            <span className="text-sm font-medium text-slate-700">{group.ringTimeout}s</span>
          </div>
        </div>
      </div>
      <div className="p-4">
        <div className="space-y-2">
          {group.members.map((member, idx) => (
            <div
              key={member.phone}
              className="flex items-center justify-between px-4 py-2.5 bg-white border border-slate-200 rounded-lg"
            >
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-400 w-5">{idx + 1}</span>
                <div className="w-8 h-8 rounded-full bg-[#e8f0f0] text-[#336699] flex items-center justify-center text-xs font-bold">
                  {member.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")}
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">{member.name}</p>
                  <p className="text-xs text-slate-400 font-mono">{formatPhone(member.phone)}</p>
                </div>
              </div>
              {member.extension && (
                <span className="text-xs text-slate-400">ext {member.extension}</span>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="bg-slate-50 px-5 py-3 border-t border-slate-200 flex items-center gap-2 text-xs text-slate-500">
        <span>All members ring simultaneously.</span>
        <span>If no answer after {group.ringTimeout}s → voicemail.</span>
      </div>
    </div>
  );

  return (
    <div className="p-4 max-w-3xl">
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-slate-900 mb-1">Call Routing Configuration</h2>
        <p className="text-xs text-slate-500">
          Hunt groups and phone numbers are managed in <code className="text-xs bg-slate-100 px-1 rounded">phone-config.ts</code>.
          Editing will be available in v2.
        </p>
      </div>

      <div className="space-y-6">
        <HuntGroupCard group={huntGroups.sales} />
        <HuntGroupCard group={huntGroups.operator} />
      </div>

      {/* Twilio Numbers */}
      <div className="mt-8 border border-slate-200 rounded-xl overflow-hidden">
        <div className="bg-slate-50 px-5 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">Twilio Phone Numbers</h3>
        </div>
        <div className="p-4">
          {twilioNumbers.length === 0 && (
            <p className="text-sm text-slate-400">No phone numbers found</p>
          )}
          {twilioNumbers.map((n) => (
            <div key={n.sid} className="flex items-center justify-between py-2">
              <div>
                <span className="text-sm font-mono font-medium text-slate-900">
                  {formatPhone(n.number)}
                </span>
                {n.label && <span className="text-xs text-slate-400 ml-2">{n.label}</span>}
              </div>
              <Badge variant="green">Active</Badge>
            </div>
          ))}
        </div>
      </div>

      {/* Voicemail Settings */}
      <div className="mt-6 border border-slate-200 rounded-xl overflow-hidden">
        <div className="bg-slate-50 px-5 py-3 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">Voicemail Settings</h3>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">Max recording length</span>
            <span className="text-sm font-medium text-slate-900">{voicemailMaxLength}s</span>
          </div>
          <div>
            <span className="text-sm text-slate-600">Notification emails</span>
            <div className="mt-1 space-y-1">
              {voicemailEmails.map((email) => (
                <p key={email} className="text-sm font-mono text-slate-700">{email}</p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Click to Call Tab ──────────────────────────────────────────
interface ClickToCallRecord {
  id: string;
  userPhone: string;
  destinationPhone: string;
  callSid: string;
  status: "calling" | "connected" | "ended" | "failed";
  time: string;
}

function ClickToCallTab() {
  const [userPhone, setUserPhone] = useState("");
  const [destinationPhone, setDestinationPhone] = useState("");
  const [callStatus, setCallStatus] = useState<"idle" | "calling" | "connected" | "ended" | "failed">("idle");
  const [callError, setCallError] = useState<string | null>(null);
  const [history, setHistory] = useState<ClickToCallRecord[]>([]);
  const [currentCallSid, setCurrentCallSid] = useState<string | null>(null);

  function toE164(input: string): string | null {
    const digits = input.replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 15) return null;
    // 10 digits → assume US, prepend +1
    if (digits.length === 10) return `+1${digits}`;
    // 11+ digits → assume country code is included, prepend +
    return `+${digits}`;
  }

  const userE164 = toE164(userPhone);
  const destE164 = toE164(destinationPhone);
  const canCall = callStatus === "idle" || callStatus === "ended" || callStatus === "failed";
  const isValid = !!userE164 && !!destE164 && canCall;

  const handleCall = async () => {
    if (!userE164 || !destE164) return;
    setCallStatus("calling");
    setCallError(null);
    setCurrentCallSid(null);

    try {
      const res = await fetch("/api/phone/click-to-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userPhone: userE164, destinationPhone: destE164 }),
      });

      const data = await res.json();

      if (!res.ok) {
        setCallStatus("failed");
        setCallError(data.error || `Call failed (${res.status})`);
        setHistory((prev) => [
          {
            id: Date.now().toString(),
            userPhone: userE164,
            destinationPhone: destE164,
            callSid: "",
            status: "failed",
            time: new Date().toISOString(),
          },
          ...prev,
        ]);
        return;
      }

      setCurrentCallSid(data.callSid);
      setCallStatus("connected");
      setHistory((prev) => [
        {
          id: Date.now().toString(),
          userPhone: userE164,
          destinationPhone: destE164,
          callSid: data.callSid,
          status: "connected",
          time: new Date().toISOString(),
        },
        ...prev,
      ]);

      // Auto-reset to idle after 5 seconds
      setTimeout(() => setCallStatus("ended"), 5000);
    } catch (err) {
      console.error("[click-to-call] Error:", err);
      setCallStatus("failed");
      setCallError("Network error — could not initiate call");
    }
  };

  return (
    <div className="p-6 max-w-lg mx-auto">
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-slate-900 mb-1">Click to Call</h2>
        <p className="text-xs text-slate-500">
          Enter your phone number and a destination. We&apos;ll call your phone first, then connect you to the destination.
          Both parties will see +1 (312) 869-8000 as the caller ID.
        </p>
      </div>

      <div className="space-y-4">
        {/* Your Phone Number */}
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Your Phone Number</label>
          <input
            type="tel"
            value={userPhone}
            onChange={(e) => setUserPhone(e.target.value)}
            placeholder="(555) 867-5309"
            className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c2d6d6] focus:border-[#669999]"
          />
          <p className="text-xs text-slate-400 mt-1">
            {userPhone && !userE164
              ? "Enter a valid phone number, e.g. (555) 867-5309 or +44 20 7946 0958"
              : "We\u2019ll call this number first"}
          </p>
        </div>

        {/* Destination Number */}
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1">Destination Number</label>
          <input
            type="tel"
            value={destinationPhone}
            onChange={(e) => setDestinationPhone(e.target.value)}
            placeholder="+44 20 7946 0958"
            className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#c2d6d6] focus:border-[#669999]"
          />
          <p className="text-xs text-slate-400 mt-1">
            {destinationPhone && !destE164
              ? "Enter a valid phone number, e.g. (555) 867-5309 or +44 20 7946 0958"
              : "The number you want to call. International numbers need + country code."}
          </p>
        </div>

        {/* Call Button */}
        <button
          onClick={handleCall}
          disabled={!isValid}
          className="w-full py-3 bg-[#0D3B66] text-white rounded-lg hover:bg-[#336699] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm font-medium"
        >
          <PhoneOutgoing size={16} />
          {callStatus === "calling" ? "Calling your phone..." : "Call"}
        </button>

        {/* Status Area */}
        {callStatus !== "idle" && (
          <div
            className={`px-4 py-3 rounded-lg text-sm ${
              callStatus === "calling"
                ? "bg-amber-50 text-amber-700 border border-amber-200"
                : callStatus === "connected"
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : callStatus === "ended"
                ? "bg-slate-50 text-slate-600 border border-slate-200"
                : "bg-red-50 text-red-600 border border-red-200"
            }`}
          >
            {callStatus === "calling" && (
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                Calling your phone at {formatPhone(userE164 || userPhone)}...
              </div>
            )}
            {callStatus === "connected" && (
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Call initiated! Answer your phone to connect to {formatPhone(destE164 || destinationPhone)}.
                {currentCallSid && (
                  <span className="text-xs text-emerald-500/70 ml-auto font-mono">{currentCallSid.slice(0, 10)}...</span>
                )}
              </div>
            )}
            {callStatus === "ended" && "Call completed."}
            {callStatus === "failed" && (callError || "Call failed.")}
          </div>
        )}
      </div>

      {/* Recent History */}
      {history.length > 0 && (
        <div className="mt-8">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
            Recent Calls (this session)
          </h3>
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase">Destination</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase">Status</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase">Time</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-b border-slate-100">
                    <td className="px-4 py-2 text-slate-700">{formatPhone(h.destinationPhone)}</td>
                    <td className="px-4 py-2">
                      <Badge variant={h.status === "connected" ? "green" : h.status === "failed" ? "red" : "default"}>
                        {h.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-slate-500 text-xs">{formatDate(h.time)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab Configuration ──────────────────────────────────────────
const TABS = [
  { key: "voicemail", label: "Voicemail", icon: Voicemail },
  { key: "messages", label: "Messages", icon: MessageSquare },
  { key: "calllog", label: "Call Log", icon: List },
  { key: "directory", label: "Directory", icon: Users },
  { key: "clicktocall", label: "Click to Call", icon: PhoneOutgoing },
  { key: "config", label: "Config", icon: Settings },
] as const;

// ─── Main Page ──────────────────────────────────────────────────
export default function PhonePage() {
  const [activeTab, setActiveTab] = useState<string>("voicemail");
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [callsRes, messagesRes, configRes] = await Promise.all([
        fetch("/api/phone/calls"),
        fetch("/api/phone/messages"),
        fetch("/api/phone/config"),
      ]);

      if (callsRes.ok) {
        const data = await callsRes.json();
        setCalls(data.calls || []);
      }
      if (messagesRes.ok) {
        const data = await messagesRes.json();
        setMessages(data.messages || []);
      }
      if (configRes.ok) {
        const data = await configRes.json();
        setConfig(data);
      }
    } catch (err) {
      console.error("Failed to load phone data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <AppLayout>
      <div className="-m-8">
        {/* Header */}
        <div
          style={{
            background: `linear-gradient(135deg, ${brand.navy} 0%, ${brand.darkBlue} 50%, ${brand.teal} 100%)`,
          }}
          className="px-6 py-4"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-white/10 backdrop-blur rounded-lg flex items-center justify-center text-white">
                <Phone size={18} />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white tracking-tight">Phone</h1>
                <p className="text-xs text-white/70">Voyage Advisory &mdash; Twilio PBX</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/70 font-mono">
                {formatPhone("+13128698000")}
              </span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            </div>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="border-b border-slate-200 bg-white">
          <div className="flex">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.key
                      ? "border-[#336699] text-[#336699]"
                      : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
                  }`}
                >
                  <Icon size={18} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="bg-white border-b border-slate-200" style={{ minHeight: "calc(100vh - 200px)" }}>
          {loading ? (
            <div className="flex items-center justify-center py-20 text-slate-400 text-sm">
              Loading phone data...
            </div>
          ) : (
            <>
              {activeTab === "voicemail" && <VoicemailTab calls={calls} />}
              {activeTab === "messages" && (
                <MessagesTab messages={messages} twilioNumbers={config?.twilioNumbers || []} />
              )}
              {activeTab === "calllog" && <CallLogTab calls={calls} />}
              {activeTab === "directory" && <DirectoryTab directory={config?.directory || []} />}
              {activeTab === "clicktocall" && <ClickToCallTab />}
              {activeTab === "config" && <ConfigTab config={config} />}
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
