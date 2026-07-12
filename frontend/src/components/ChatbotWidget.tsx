import { useEffect, useRef, useState } from "react";
import { Bot, Send, X } from "lucide-react";

type Role = "user" | "assistant";

type ChatMessage = {
  id: string;
  role: Role;
  text: string;
};

const WELCOME =
  "Hi — I'm the Tele-Exit AI assistant. Ask me how practice calls work, what readiness means, or how to get started.";

function replyTo(input: string): string {
  const q = input.toLowerCase().trim();

  if (/hello|hi\b|hey|selam/.test(q)) {
    return "Hello. I can help you understand Tele-Exit — practice calls, readiness, signup, or what to expect before your exit exam.";
  }
  if (/account|register|sign\s*up|create/.test(q)) {
    return "Create an account from Create account in the nav. You'll set your name, email, field of study, and exam date so practice can aim at your timeline.";
  }
  if (/login|log\s*in|sign\s*in|password|forgot/.test(q)) {
    return "Use Log in in the nav with your email and password. If you forgot your password, use Forgot password? on the login screen — or email hello@tele-exit.et for help.";
  }
  if (/call|practice|session|live|video/.test(q)) {
    return "A practice call is a live one-on-one session with an AI study partner. You work through real previous-year exit exam questions out loud — explanations when you're stuck, follow-ups when you're not.";
  }
  if (/readiness|score|progress|plan/.test(q)) {
    return "Your readiness score updates after each session from how you do on topics. It powers your focus areas and next steps so you're always working on what matters before exam day.";
  }
  if (/question|exam|field|study|ethiopia/.test(q)) {
    return "Sessions use previous-year exit exam questions in your field — the same kind of material you'll face on exam day, not generic summaries.";
  }
  if (/contact|email|phone|support|help/.test(q)) {
    return "Reach us at hello@tele-exit.et or +251 911 000 000 (Addis Ababa). You can also scroll to Contact on the home page.";
  }
  if (/price|cost|free|pay/.test(q)) {
    return "Tele-Exit is built for Ethiopian exit-exam prep. For current access and pricing details, email hello@tele-exit.et and we'll point you to the right next step.";
  }

  return "I can help with practice calls, readiness, signup, or contact. Try asking “How do practice calls work?” or “What is readiness?” — or email hello@tele-exit.et for anything personal to your account.";
}

/**
 * Floating AI chatbot for marketing + auth pages.
 */
export function ChatbotWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "welcome", role: "assistant", text: WELCOME },
  ]);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open, busy]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      text,
    };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setBusy(true);

    // Brief pause so the reply feels conversational.
    await new Promise((r) => setTimeout(r, 550 + Math.random() * 400));

    setMessages((m) => [
      ...m,
      {
        id: `a-${Date.now()}`,
        role: "assistant",
        text: replyTo(text),
      },
    ]);
    setBusy(false);
  }

  return (
    <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3">
      {open && (
        <div
          role="dialog"
          aria-label="Tele-Exit AI chatbot"
          className="fade-in flex h-[min(70dvh,440px)] w-[min(100vw-2.5rem,360px)] flex-col overflow-hidden rounded-xl border border-hairline bg-background shadow-[0_16px_40px_oklch(0.28_0.06_260_/_0.14)]"
        >
          <div className="flex items-center justify-between bg-primary px-4 py-3 text-primary-foreground">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-foreground/10">
                <Bot className="h-4 w-4 text-[var(--amber)]" />
              </span>
              <div>
                <p className="text-sm font-medium leading-tight">Tele-Exit AI</p>
                <p className="text-[11px] text-primary-foreground/70">Study assistant</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md p-1 transition-colors hover:bg-primary-foreground/10"
              aria-label="Close chat"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div
            ref={listRef}
            className="flex-1 space-y-3 overflow-y-auto px-3 py-3 text-sm"
            aria-live="polite"
          >
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={
                  "flex " + (msg.role === "user" ? "justify-end" : "justify-start")
                }
              >
                <p
                  className={
                    "max-w-[85%] rounded-2xl px-3 py-2 leading-relaxed " +
                    (msg.role === "user"
                      ? "rounded-br-md bg-primary text-primary-foreground"
                      : "rounded-bl-md bg-[color:var(--surface)] text-foreground")
                  }
                >
                  {msg.text}
                </p>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start">
                <p className="rounded-2xl rounded-bl-md bg-[color:var(--surface)] px-3 py-2 text-muted-foreground">
                  <span className="pulse-dot">·</span>
                  <span className="pulse-dot" style={{ animationDelay: "120ms" }}>
                    ·
                  </span>
                  <span className="pulse-dot" style={{ animationDelay: "240ms" }}>
                    ·
                  </span>
                  Thinking
                </p>
              </div>
            )}
          </div>

          <form
            className="flex items-center gap-2 border-t border-hairline px-3 py-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <label htmlFor="tx-chat-input" className="sr-only">
              Message Tele-Exit AI
            </label>
            <input
              id="tx-chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about Tele-Exit…"
              disabled={busy}
              className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              aria-label="Send message"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? "Close AI chat" : "Open AI chat"}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_8px_24px_oklch(0.28_0.06_260_/_0.22)] transition-transform duration-300 hover:scale-105 hover:bg-primary/90"
      >
        {open ? <X className="h-6 w-6" /> : <Bot className="h-6 w-6" />}
      </button>
    </div>
  );
}
