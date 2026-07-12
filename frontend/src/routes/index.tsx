import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6">
        <div className="flex items-center gap-2">
          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--amber)]" />
          <span className="font-display text-lg text-primary">Tele-Exit</span>
        </div>
        <nav className="flex items-center gap-2">
          <Link
            to="/login"
            className="rounded-md px-3 py-2 text-sm text-primary hover:bg-secondary"
          >
            Log in
          </Link>
          <Link
            to="/register"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Create account
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-24 pt-12 md:pt-24">
        <p className="eyebrow">For final-year Ethiopian university students</p>
        <h1 className="mt-4 font-display text-4xl leading-tight text-primary md:text-6xl">
          Practice for your exit exam the way you'd study with a friend who
          really knows the material.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
          Tele-Exit is a one-on-one live video call with an AI study partner.
          You work through real previous-year exit exam questions together —
          talking through your thinking, getting things explained when you're
          stuck, and steadily closing the gaps before your exam date.
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Link
            to="/register"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 text-base font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Create your account
            <span aria-hidden className="text-[var(--amber)]">→</span>
          </Link>
          <Link
            to="/login"
            className="inline-flex items-center rounded-md border border-input px-6 py-3 text-base text-primary transition-colors hover:bg-secondary"
          >
            I already have an account
          </Link>
        </div>

        <section className="mt-20 grid gap-8 md:grid-cols-3">
          {[
            {
              title: "Real questions, not summaries",
              body: "Every session is built from previous-year exit exam questions in your field — the same material you'll face on exam day.",
            },
            {
              title: "A conversation, not a quiz",
              body: "Talk through your reasoning out loud. The AI asks follow-ups, explains what's unclear, and finds a video when it helps.",
            },
            {
              title: "Aimed at your exam date",
              body: "Your readiness score and weekly plan shift as your date gets closer — so you're always working on what matters most next.",
            },
          ].map((c) => (
            <div key={c.title}>
              <h2 className="font-display text-xl text-primary">{c.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {c.body}
              </p>
            </div>
          ))}
        </section>
      </main>

      <footer className="hairline-b border-t border-hairline">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6 text-sm text-muted-foreground">
          <span>© {new Date().getFullYear()} Tele-Exit</span>
          <span>Made for students in Ethiopia</span>
        </div>
      </footer>
    </div>
  );
}
