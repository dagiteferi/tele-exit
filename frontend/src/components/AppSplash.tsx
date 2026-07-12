/**
 * Splash shown while auth/session storage initializes.
 * Mirrors the marketing page skeleton (nav + hero + cards). No fixed delay.
 */
export function AppSplash() {
  return (
    <div
      className="min-h-dvh bg-background text-foreground"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Tele-Exit is loading"
    >
      {/* Nav skeleton */}
      <div className="border-b border-hairline">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-2">
            <div aria-hidden className="skeleton-pulse h-8 w-8 rounded-lg" />
            <div aria-hidden className="skeleton-pulse h-5 w-28 rounded" />
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            <div aria-hidden className="skeleton-pulse h-4 w-12 rounded" />
            <div aria-hidden className="skeleton-pulse h-4 w-14 rounded" />
            <div aria-hidden className="skeleton-pulse h-4 w-16 rounded" />
          </div>
          <div className="flex items-center gap-2">
            <div aria-hidden className="skeleton-pulse h-9 w-16 rounded-md" />
            <div aria-hidden className="skeleton-pulse h-9 w-28 rounded-md" />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-5 pt-12 md:pt-20">
        {/* Hero skeleton */}
        <div className="grid items-center gap-10 md:grid-cols-2 md:gap-16">
          <div className="space-y-4">
            <div aria-hidden className="skeleton-pulse h-10 w-full max-w-md rounded" />
            <div aria-hidden className="skeleton-pulse h-10 w-[90%] max-w-sm rounded" />
            <div aria-hidden className="skeleton-pulse h-10 w-[75%] max-w-xs rounded" />
          </div>
          <div className="flex flex-wrap gap-3 md:justify-end">
            <div aria-hidden className="skeleton-pulse h-12 w-44 rounded-md" />
            <div aria-hidden className="skeleton-pulse h-12 w-48 rounded-md" />
          </div>
        </div>

        {/* Feature cards skeleton */}
        <div className="mt-20 grid gap-5 md:grid-cols-3 md:gap-6">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              aria-hidden
              className="rounded-xl border border-hairline p-6"
            >
              <div className="skeleton-pulse mb-4 h-2.5 w-2.5 rounded-full" />
              <div className="skeleton-pulse h-5 w-3/4 rounded" />
              <div className="skeleton-pulse mt-3 h-3 w-full rounded" />
              <div className="skeleton-pulse mt-2 h-3 w-[88%] rounded" />
              <div className="skeleton-pulse mt-2 h-3 w-[70%] rounded" />
            </div>
          ))}
        </div>
      </div>

      <span className="sr-only">Loading Tele-Exit</span>
    </div>
  );
}
