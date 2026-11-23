import { CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/primitives";

/** Status de confirmação — cor + ícone + texto (nunca só cor). */
export function ConfirmationStatus({ status }: { status: "pending" | "confirmed" | "declined" }) {
  if (status === "confirmed")
    return (
      <Badge tone="success" icon={<CheckCircle2 className="h-3.5 w-3.5" aria-hidden />}>
        Confirmado
      </Badge>
    );
  if (status === "declined")
    return (
      <Badge tone="danger" icon={<XCircle className="h-3.5 w-3.5" aria-hidden />}>
        Recusou
      </Badge>
    );
  return (
    <Badge tone="neutral" icon={<CircleDashed className="h-3.5 w-3.5" aria-hidden />}>
      Pendente
    </Badge>
  );
}
