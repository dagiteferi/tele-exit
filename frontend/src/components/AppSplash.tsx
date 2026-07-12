/**
 * App splash shown while auth/session storage initializes.
 * No fixed delay — parent unmounts this as soon as ready is true.
 */
export function AppSplash() {
  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center bg-background px-5"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Tele-Exit is loading"
    >
      <div className="flex flex-col items-center">
        <div className="flex items-center gap-2">
          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full bg-[var(--amber)]" />
          <span className="font-display text-2xl text-primary">Tele-Exit</span>
        </div>

        {/* Dashboard-shaped skeleton: ring + text lines */}
        <div className="mt-14 w-full max-w-md">
          <div className="flex flex-col items-center gap-8 sm:flex-row sm:items-center sm:gap-10">
            <div
              aria-hidden
              className="skeleton-pulse h-[140px] w-[140px] shrink-0 rounded-full"
            />
            <div className="w-full max-w-[220px] space-y-3">
              <div aria-hidden className="skeleton-pulse h-3 w-24 rounded" />
              <div aria-hidden className="skeleton-pulse h-10 w-full rounded" />
              <div aria-hidden className="skeleton-pulse h-3 w-40 rounded" />
              <div aria-hidden className="skeleton-pulse h-3 w-32 rounded" />
            </div>
          </div>
          <div aria-hidden className="skeleton-pulse mt-10 h-12 w-full rounded-xl" />
          <div className="mt-8 grid gap-3">
            <div aria-hidden className="skeleton-pulse h-3 w-full rounded" />
            <div aria-hidden className="skeleton-pulse h-3 w-[88%] rounded" />
            <div aria-hidden className="skeleton-pulse h-3 w-[72%] rounded" />
          </div>
        </div>
      </div>
      <span className="sr-only">Loading your session</span>
    </div>
  );
}
