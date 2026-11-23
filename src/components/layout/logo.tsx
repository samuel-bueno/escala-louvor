import { APP } from "@/config/app";

/**
 * Marca da igreja (ADNO). Os PNGs em /public/brand são brancos com transparência;
 * usados como máscara, a cor vem do tema: tinta no claro, papel no escuro.
 */
function Brand({ src, ratio, width, label, color = "var(--fg)", className }: { src: string; ratio: number; width: number; label?: string; color?: string; className?: string }) {
  const mask = `url(${src}) center / contain no-repeat`;
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={className}
      style={{ display: "inline-block", width, height: width / ratio, background: color, mask, WebkitMask: mask }}
    />
  );
}

/** Pomba da ADNO num quadrado: sidebar, páginas de acesso, link público. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <span aria-hidden className="inline-grid shrink-0 place-items-center" style={{ width: size, height: size, borderRadius: Math.round(size * 0.23), background: "var(--fg)" }}>
      <Brand src="/brand/adno-pomba-solida.png" ratio={640 / 339} width={Math.round(size * 0.72)} color="var(--bg)" />
    </span>
  );
}

/** Logo completo: ADNO · Assembleia de Deus · Nova Odessa · Jardim Minezotta. */
export function LogoFull({ width = 220, color }: { width?: number; color?: string }) {
  return <Brand src="/brand/adno-logo.png" ratio={1100 / 632} width={width} color={color} label="ADNO — Assembleia de Deus Nova Odessa, Jardim Minezotta" />;
}

export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <LogoMark />
      <span className="text-[15px] font-semibold tracking-tight">{APP.name}</span>
    </span>
  );
}
