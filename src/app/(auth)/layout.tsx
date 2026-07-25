/**
 * Auth shell — centered card on soft brand ambient background.
 * Shared by /login, /signup, /reset-password, /invite/*
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-slate-50 px-4 py-10">
      {/* Ambient brand orbs — decorative, no interaction */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute -top-28 -left-20 h-72 w-72 rounded-full bg-primary/20 blur-3xl motion-safe:animate-pulse" />
        <div className="absolute -right-16 top-1/3 h-64 w-64 rounded-full bg-violet-300/25 blur-3xl" />
        <div className="absolute -bottom-24 left-1/3 h-80 w-80 rounded-full bg-fuchsia-200/20 blur-3xl" />
        {/* Subtle grid for depth without noise */}
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgb(148 163 184 / 0.25) 1px, transparent 0)",
            backgroundSize: "24px 24px",
          }}
        />
      </div>

      <div className="relative z-10 flex w-full max-w-md flex-col items-center">
        {children}
      </div>
    </div>
  );
}
