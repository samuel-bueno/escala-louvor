import { APP } from "@/config/app";

/**
 * Marca do app: nota musical em /public/brand/mark.svg (branca, com transparência).
 * Usada como máscara, então a cor vem do tema: tinta no claro, papel no escuro.
 */
const MARK = "/brand/mark.svg";

function Mark({ size, color }: { size: number; color: string }) {
  const mask = `url(${MARK}) center / contain no-repeat`;
  return <span aria-hidden style={{ display: "inline-block", width: size, height: size, background: color, mask, WebkitMask: mask }} />;
}

/** Marca num quadrado: sidebar, páginas de acesso, link público. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <span aria-hidden className="inline-grid shrink-0 place-items-center" style={{ width: size, height: size, borderRadius: Math.round(size * 0.23), background: "var(--fg)" }}>
      <Mark size={Math.round(size * 0.6)} color="var(--bg)" />
    </span>
  );
}

/** Marca + nome do app (barra lateral no desktop e tela de login). */
export function LogoFull({ width = 220, color = "var(--fg)" }: { width?: number; color?: string }) {
  const size = Math.round(width * 0.2);
  return (
    <span role="img" aria-label={APP.name} className="inline-flex items-center gap-2.5 font-semibold tracking-tight" style={{ color, fontSize: Math.round(width * 0.12) }}>
      <Mark size={size} color={color} />
      {APP.name}
    </span>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <LogoMark />
      <span className="text-[15px] font-semibold tracking-tight">{APP.name}</span>
    </span>
  );
}
