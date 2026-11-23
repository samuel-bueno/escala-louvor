import { AlertTriangle, Info, OctagonAlert } from "lucide-react";
import { dedupeAlerts, type ScheduleAlert } from "@/domain/scheduling/alerts";
import { cn } from "@/lib/cn";
import { plural } from "@/lib/plural";

const meta = {
  error: { icon: OctagonAlert, cls: "text-danger", label: "Bloqueia publicação" },
  warning: { icon: AlertTriangle, cls: "text-warning", label: "Aviso" },
  info: { icon: Info, cls: "text-info", label: "Informação" },
} as const;

/** Lista de alertas da escala, agrupada por severidade (erro → aviso → info). */
export function AlertList({ alerts, compact }: { alerts: ScheduleAlert[]; compact?: boolean }) {
  if (!alerts.length) return null;
  const order = { error: 0, warning: 1, info: 2 };
  const sorted = dedupeAlerts([...alerts].sort((a, b) => order[a.severity] - order[b.severity]));
  let shown = compact ? sorted.filter((a) => a.severity !== "info") : sorted;
  // No resumo, vagas vazias viram uma linha só (evita uma lista repetitiva).
  const empty = shown.filter((a) => a.code === "required-empty");
  if (compact && empty.length > 1) {
    shown = [
      ...shown.filter((a) => a.code !== "required-empty"),
      { severity: "warning", slotId: null, participantId: null, code: "required-empty", message: `${empty.length} posições obrigatórias vazias.` },
    ];
  }
  if (!shown.length) return null;
  return (
    <ul className="flex flex-col gap-1" aria-label="Alertas da escala">
      {shown.map((a, i) => {
        const m = meta[a.severity];
        return (
          <li key={i} className={cn("flex items-start gap-2 text-[13px]", m.cls)}>
            <m.icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span className="text-fg-2">
              <span className="sr-only">{m.label}: </span>
              {a.message}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function AlertDot({ alerts }: { alerts: ScheduleAlert[] }) {
  if (!alerts.length) return null;
  const worst = alerts.some((a) => a.severity === "error") ? "error" : alerts.some((a) => a.severity === "warning") ? "warning" : "info";
  const m = meta[worst];
  return <m.icon className={cn("h-4 w-4", m.cls.split(" ").pop())} aria-label={`${alerts.length} ${plural(alerts.length, "alerta", "alertas")}`} />;
}
