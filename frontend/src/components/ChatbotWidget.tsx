import { useState } from "react";
import { MessageCircle, X } from "lucide-react";

/**
 * Floating chatbot affordance for the marketing site.
 * Opens a lightweight panel; real chat backend can plug in later.
 */
export function ChatbotWidget() {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3">
      {open && (
        <div
          role="dialog"
          aria-label="Tele-Exit chat"
          className="fade-in w-[min(100vw-2.5rem,320px)] overflow-hidden rounded-xl border border-hairline bg-background shadow-[var(--shadow-quiet)]"
        >
          <div className="flex items-center justify-between bg-primary px-4 py-3 text-primary-foreground">
            <div className="flex items-center gap-2">
              <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-[var(--amber)]" />
              <p className="text-sm font-medium">Tele-Exit assistant</p>
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
          <div className="space-y-3 px-4 py-4 text-sm">
            <p className="rounded-lg bg-[color:var(--surface)] px-3 py-2 text-muted-foreground">
              Hi — ask about practice calls, your exam date, or how Tele-Exit
              works. For account issues, email{" "}
              <a
                href="mailto:hello@tele-exit.et"
                className="text-primary underline underline-offset-2"
              >
                hello@tele-exit.et
              </a>
              .
            </p>
            <a
              href="mailto:hello@tele-exit.et?subject=Tele-Exit%20question"
              className="inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Send us a message
            </a>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? "Close chat" : "Open chat"}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_8px_24px_oklch(0.28_0.06_260_/_0.22)] transition-transform duration-300 hover:scale-105 hover:bg-primary/90"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>
    </div>
  );
}
