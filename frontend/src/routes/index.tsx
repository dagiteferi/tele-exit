import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { ChatbotWidget } from "@/components/ChatbotWidget";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [{ title: "Tele-Exit" }],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <SiteHeader />

      <main>
        <section
          className="relative overflow-hidden border-b border-hairline"
          style={{
            backgroundColor: "var(--paper)",
            backgroundImage: "url(/hero-bg.png)",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right bottom",
            backgroundSize: "cover",
          }}
        >
          <div className="mx-auto grid max-w-6xl items-center gap-16 px-5 pb-20 pt-12 md:grid-cols-2 md:gap-24 md:pb-28 md:pt-20">
            <div>
              <h1 className="max-w-[600px] font-display text-4xl leading-[1.12] text-primary md:text-[3.25rem] md:leading-[1.1]">
                Practice for your exit exam the way you'd study with a friend who
                really knows the material.
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-3 md:justify-end md:pl-8">
              <Link
                to="/register"
                className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-6 py-3 text-base font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Create your account
                <span aria-hidden className="text-[var(--amber)]">
                  →
                </span>
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center justify-center rounded-md border border-input bg-background/80 px-6 py-3 text-base text-primary backdrop-blur-sm transition-colors hover:bg-secondary"
              >
                I already have an account
              </Link>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 pb-20">
          <div className="grid gap-5 md:grid-cols-3 md:gap-6">
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
              <article
                key={c.title}
                className="group rounded-xl border border-hairline bg-background p-6 shadow-[var(--shadow-quiet)] transition-[border-color,box-shadow,transform] duration-300 ease-out hover:-translate-y-1 hover:border-[color:var(--amber-strong)] hover:shadow-[0_12px_32px_oklch(0.28_0.06_260_/_0.10)]"
              >
                <span
                  aria-hidden
                  className="mb-4 inline-block h-2.5 w-2.5 rounded-full bg-[var(--amber)] transition-transform duration-300 group-hover:scale-125"
                />
                <h2 className="font-display text-xl text-primary transition-colors group-hover:text-primary">
                  {c.title}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {c.body}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-t border-hairline bg-[color:var(--surface)]">
          <div className="mx-auto max-w-6xl px-5 py-20">
            <p className="eyebrow">How it works</p>
            <h2 className="mt-3 max-w-xl font-display text-3xl text-primary">
              Three steps from signup to a clearer exam day.
            </h2>
            <ol className="mt-12 grid gap-5 md:grid-cols-3 md:gap-6">
              {[
                {
                  n: "01",
                  title: "Start a call",
                  body: "Open a live one-on-one session when you're ready — no scheduling maze, just you and your study partner.",
                },
                {
                  n: "02",
                  title: "Work through a real question together",
                  body: "Talk through previous-year exit exam questions out loud. Ask for help when you're stuck; keep going when you're not.",
                },
                {
                  n: "03",
                  title: "Get a readiness score and plan",
                  body: "After each session, your readiness updates and your next focus areas become clearer.",
                },
              ].map((step) => (
                <li
                  key={step.n}
                  className="group list-none rounded-xl border border-hairline bg-background p-6 shadow-[var(--shadow-quiet)] transition-[border-color,box-shadow,transform] duration-300 ease-out hover:-translate-y-1 hover:border-[color:var(--amber-strong)] hover:shadow-[0_12px_32px_oklch(0.28_0.06_260_/_0.10)]"
                >
                  <p className="font-display text-sm text-[var(--amber-strong)] transition-transform duration-300 group-hover:translate-x-0.5">
                    {step.n}
                  </p>
                  <h3 className="mt-3 font-display text-xl text-primary">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {step.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="about" className="scroll-mt-24 border-t border-hairline">
          <div className="mx-auto max-w-3xl px-5 py-20">
            <p className="eyebrow">About</p>
            <h2 className="mt-3 font-display text-3xl text-primary md:text-4xl">
              Built for the weeks that matter most.
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
              Tele-Exit is a one-on-one live video call with an AI study partner.
              You work through real previous-year exit exam questions together —
              talking through your thinking, getting things explained when you're
              stuck, and steadily closing the gaps before your exam date.
            </p>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Designed for final-year Ethiopian university students who need
              focused practice, not another pile of notes.
            </p>
          </div>
        </section>

        <section
          id="contact"
          className="scroll-mt-24 border-t border-hairline"
          style={{
            backgroundColor: "var(--paper)",
            backgroundImage: "url(/contact-bg.png)",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right top",
            backgroundSize: "cover",
          }}
        >
          <div className="mx-auto grid max-w-6xl items-start gap-12 px-5 py-20 md:grid-cols-2 md:gap-16">
            <div>
              <p className="eyebrow">Contact</p>
              <h2 className="mt-3 font-display text-3xl text-primary md:text-4xl">
                We're here when you need us.
              </h2>
              <p className="mt-4 max-w-md text-muted-foreground">
                Questions about your account, field of study, or how practice
                calls work? Reach out — we read every message.
              </p>
            </div>

            <ul className="grid gap-4 sm:grid-cols-1">
              {[
                {
                  label: "Email",
                  value: "hello@tele-exit.et",
                  href: "mailto:hello@tele-exit.et",
                },
                {
                  label: "Phone",
                  value: "+251 911 000 000",
                  href: "tel:+251911000000",
                },
                {
                  label: "Office",
                  value: "Addis Ababa, Ethiopia",
                  href: undefined as string | undefined,
                },
              ].map((item) => (
                <li
                  key={item.label}
                  className="rounded-xl border border-hairline bg-background/90 px-5 py-4 shadow-[var(--shadow-quiet)] backdrop-blur-sm transition-[border-color,transform] duration-300 hover:-translate-y-0.5 hover:border-[color:var(--amber-strong)]"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {item.label}
                  </p>
                  {item.href ? (
                    <a
                      href={item.href}
                      className="mt-1 block text-base text-primary transition-colors hover:text-primary/80"
                    >
                      {item.value}
                    </a>
                  ) : (
                    <p className="mt-1 text-base text-primary">{item.value}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <SiteFooter />
      <ChatbotWidget />
    </div>
  );
}
