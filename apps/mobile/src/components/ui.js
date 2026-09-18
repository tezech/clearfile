/**
 * Small, shared presentational primitives for the mobile app. Centralizing
 * these means every screen gets the same radius/shadow/motion for free
 * instead of re-declaring inline style objects per screen.
 */

const BRAND_GRADIENT = "linear-gradient(135deg, var(--color-cyan) 0%, var(--color-blue) 55%, var(--color-violet) 100%)";

export function Card({ as: Tag = "div", className = "", children, ...props }) {
  return (
    <Tag
      className={`rounded-[20px] border border-line bg-surface shadow-[0_10px_30px_-6px_rgba(0,0,0,0.45)] ${className}`}
      {...props}
    >
      {children}
    </Tag>
  );
}

export function ToolTitle({ children }) {
  return (
    <div className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-cyan mb-1">
      {children}
    </div>
  );
}

const buttonVariants = {
  primary:
    "text-[#04141a] shadow-[0_6px_20px_-4px_rgba(0,229,255,0.35)] disabled:shadow-none disabled:bg-surface-3 disabled:text-ink-faint",
  secondary: "bg-surface-2 border border-line-glow text-ink",
  ghost: "bg-transparent border border-line text-ink-muted",
  danger: "bg-red text-white",
};

export function Button({ variant = "primary", className = "", style, disabled, children, ...props }) {
  const variantClass = buttonVariants[variant] ?? buttonVariants.primary;
  const primaryStyle = variant === "primary" && !disabled ? { backgroundImage: BRAND_GRADIENT, ...style } : style;
  return (
    <button
      className={`rounded-xl font-bold text-[13px] px-4 py-3 w-full disabled:cursor-not-allowed ${variantClass} ${className}`}
      style={primaryStyle}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}

export function Chip({ active, className = "", children, ...props }) {
  return (
    <button
      className={`rounded-lg border text-[12px] font-bold py-2.5 transition-colors ${
        active
          ? "border-cyan bg-cyan/10 text-cyan"
          : "border-line bg-surface-2 text-ink-muted"
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function UploadDropzone({ icon, title, subtitle, children, className = "" }) {
  return (
    <label
      className={`flex flex-col items-center border-2 border-dashed border-line rounded-2xl px-4 py-9 cursor-pointer bg-surface-2/60 hover:border-cyan/50 transition-colors ${className}`}
    >
      {icon && <div className="text-cyan mb-2">{icon}</div>}
      <span className="text-[14px] font-semibold text-ink text-center">{title}</span>
      {subtitle && <span className="text-[10.5px] text-ink-faint mt-1 text-center">{subtitle}</span>}
      {children}
    </label>
  );
}

export function ResultBanner({ tone = "success", children }) {
  const tones = {
    success: "border-green/40 bg-green/10 text-green",
    caution: "border-amber/40 bg-amber/10 text-amber",
    danger: "border-red/40 bg-red/10 text-red",
  };
  return (
    <div className={`rounded-2xl border p-3.5 flex flex-col gap-2.5 ${tones[tone]}`}>
      {children}
    </div>
  );
}
