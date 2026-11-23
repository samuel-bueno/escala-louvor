import { cn } from "@/lib/cn";

/* Tons terrosos e dessaturados: identificam pessoas sem virar um arco-íris. */
const palette = ["#8a6a4f", "#5f7a6b", "#626a8c", "#8c5c66", "#4f7884", "#7a7350", "#6d5c80", "#5c6f52", "#86664a", "#4d6b78"];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** Avatar com iniciais. Decorativo: o nome sempre aparece ao lado. */
export function Avatar({ name, size = 32, className, muted }: { name: string; size?: number; className?: string; muted?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn("inline-grid shrink-0 place-items-center rounded-full font-semibold tracking-tight text-white", muted && "opacity-45 grayscale", className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38), background: palette[hash(name) % palette.length] }}
    >
      {initials(name)}
    </span>
  );
}

/** Pilha de avatares (ex.: equipe de um culto). */
export function AvatarStack({ names, max = 5, size = 24 }: { names: string[]; max?: number; size?: number }) {
  const shown = names.slice(0, max);
  return (
    <span className="inline-flex items-center">
      {shown.map((n, i) => (
        <Avatar key={`${n}-${i}`} name={n} size={size} className={cn("ring-2 ring-surface", i > 0 && "-ml-1.5")} />
      ))}
      {names.length > max && <span className="ml-1.5 text-[12px] text-muted">+{names.length - max}</span>}
    </span>
  );
}
