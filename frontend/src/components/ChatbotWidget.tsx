import { useEffect, useRef, useState } from "react";
import { Bot, Send, X } from "lucide-react";
import { ApiError, supportChatStream } from "@/lib/api";

type Role = "user" | "assistant";

type ChatMessage = {
  id: string;
  role: Role;
  text: string;
  streaming?: boolean;
};

const WELCOME =
  "Hi — I'm the Tele-Exit home assistant. Ask about signup, practice calls, readiness, or how the product works.";

/**
 * Home-page-only floating chatbot with streamed typing replies.
 */
export function ChatbotWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "welcome", role: "assistant", text: WELCOME },
  ]);
  const listRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open, busy]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      text,
    };
    const assistantId = `a-${Date.now()}`;
    setMessages((m) => [
      ...m,
      userMsg,
      { id: assistantId, role: "assistant", text: "", streaming: true },
    ]);
    setInput("");
    setBusy(true);

    try {
      await supportChatStream(text, {
        useWeb: false,
        signal: controller.signal,
        onToken: (chunk) => {
          setMessages((m) =>
            m.map((msg) =>
              msg.id === assistantId
                ? { ...msg, text: msg.text + chunk, streaming: true }
                : msg,
            ),
          );
        },
      });
      setMessages((m) =>
        m.map((msg) =>
          msg.id === assistantId
            ? {
                ...msg,
                streaming: false,
                text:
                  msg.text.trim() ||
                  "I couldn't form an answer — try rephrasing, or email hello@tele-exit.et.",
              }
            : msg,
        ),
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      const msg =
        err instanceof ApiError
          ? err.message
          : "Something went wrong talking to the assistant.";
      setMessages((m) =>
        m.map((item) =>
          item.id === assistantId
            ? { ...item, text: msg, streaming: false }
            : item,
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3">
      {open && (
        <div
          role="dialog"
          aria-label="Tele-Exit home chatbot"
          className="fade-in flex h-[min(70dvh,440px)] w-[min(100vw-2.5rem,360px)] flex-col overflow-hidden rounded-xl border border-hairline bg-background shadow-[0_16px_40px_oklch(0.28_0.06_260_/_0.14)]"
        >
          <div className="flex items-center justify-between bg-primary px-4 py-3 text-primary-foreground">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-foreground/10">
                <Bot className="h-4 w-4 text-[var(--amber)]" />
              </span>
              <div>
                <p className="text-sm font-medium leading-tight">Tele-Exit AI</p>
                <p className="text-[11px] text-primary-foreground/70">Home assistant</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                abortRef.current?.abort();
                setOpen(false);
              }}
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
                    "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 leading-relaxed " +
                    (msg.role === "user"
                      ? "rounded-br-md bg-primary text-primary-foreground"
                      : "rounded-bl-md bg-[color:var(--surface)] text-foreground")
                  }
                >
                  {msg.text}
                  {msg.streaming && (
                    <span
                      className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] animate-pulse bg-primary/70 align-baseline"
                      aria-hidden
                    />
                  )}
                </p>
              </div>
            ))}
            {busy && messages[messages.length - 1]?.text === "" && (
              <div className="sr-only">Generating reply</div>
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
