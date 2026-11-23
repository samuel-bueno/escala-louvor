import { Clock, ExternalLink, MapPin } from "lucide-react";
import type { Metadata } from "next";
import { and, eq, gt, isNull } from "drizzle-orm";
import { LogoMark } from "@/components/layout/logo";
import { APP } from "@/config/app";
import { formatDate, weekdayName } from "@/domain/dates";
import { hashToken } from "@/server/auth/tokens";
import { db } from "@/server/db/client";
import { events, shareLinks } from "@/server/db/schema";
import { getEventSlots, getSetlist } from "@/server/queries/events";

export const metadata: Metadata = { title: "Escala", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

/**
 * Página pública somente leitura. Acesso por token forte (256 bits, só o hash
 * fica no banco), revogável e com validade. Mostra o mínimo: nomes de exibição,
 * funções e repertório. Nada de telefone, e-mail, motivos ou observações internas.
 */
export default async function PublicSchedulePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = /^[A-Za-z0-9_-]{32,64}$/.test(token);
  const row = valid
    ? await db
        .select({ ev: events })
        .from(shareLinks)
        .innerJoin(events, eq(events.id, shareLinks.eventId))
        .where(and(eq(shareLinks.tokenHash, hashToken(token)), isNull(shareLinks.revokedAt), gt(shareLinks.expiresAt, new Date())))
        .get()
    : undefined;

  if (!row || row.ev.status === "draft") {
    return (
      <main className="grid min-h-dvh place-items-center px-6 text-center">
        <div>
          <LogoMark size={48} />
          <h1 className="mt-4 text-xl font-semibold">Link indisponível</h1>
          <p className="mt-1 text-muted">Este link expirou ou foi revogado. Peça um novo para a liderança.</p>
        </div>
      </main>
    );
  }
  const ev = row.ev;
  const [slots, setlist] = await Promise.all([getEventSlots(ev.id), getSetlist(ev.id)]);

  return (
    <main className="safe-top mx-auto max-w-xl px-4 py-8">
      <div className="mb-6 flex items-center gap-2 text-sm font-semibold text-muted">
        <LogoMark size={24} /> {APP.name}
      </div>
      <h1 className="text-2xl font-semibold">{ev.title}</h1>
      {ev.status === "cancelled" && <p className="mt-1 font-semibold text-danger">Este compromisso foi cancelado.</p>}
      <p className="mt-1 flex flex-wrap gap-x-3 text-muted">
        <span className="inline-flex items-center gap-1">
          <Clock className="h-4 w-4" aria-hidden />
          {weekdayName(ev.date)}, {formatDate(ev.date)} • {ev.startTime}
        </span>
        {ev.location && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-4 w-4" aria-hidden />
            {ev.location}
          </span>
        )}
      </p>

      <section className="mt-6 rounded-xl border border-border bg-surface">
        <h2 className="border-b border-border px-4 py-3 font-semibold">Escala</h2>
        <ul className="divide-y divide-border">
          {slots.map((s) => (
            <li key={s.id} className="flex justify-between gap-3 px-4 py-2.5">
              <span className="text-muted">{s.functionName}</span>
              <span className="font-semibold">{s.participantName ?? (s.guestName ? `${s.guestName} (convidado)` : "A definir")}</span>
            </li>
          ))}
        </ul>
      </section>

      {setlist.length > 0 && (
        <section className="mt-5 rounded-xl border border-border bg-surface">
          <h2 className="border-b border-border px-4 py-3 font-semibold">Repertório</h2>
          <ol className="divide-y divide-border">
            {setlist.map((s, i) => (
              <li key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="tabular w-5 text-sm font-semibold text-muted">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{s.title}</span>
                  {(s.key ?? s.originalKey) && <span className="text-sm text-muted">Tom {s.key ?? s.originalKey}</span>}
                </span>
                {s.url && (
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-accent" aria-label={`Abrir link de ${s.title}`}>
                    <ExternalLink className="h-4 w-4" aria-hidden /> Ouvir
                  </a>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}
    </main>
  );
}
