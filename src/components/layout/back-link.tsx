import { ChevronLeft } from "lucide-react";
import Link from "next/link";

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="-ml-2 mb-1 inline-flex h-10 items-center gap-0.5 rounded-lg pr-3 pl-1 text-sm font-semibold text-muted hover:text-fg">
      <ChevronLeft className="h-5 w-5" aria-hidden />
      {label}
    </Link>
  );
}
