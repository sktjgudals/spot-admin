"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { formatPartyDate } from "@/lib/format-date";

export function MobilePartyHeader({
  title,
  partyTitle,
  location,
  startsAt,
}: {
  title: string;
  partyTitle?: string;
  location?: string;
  startsAt?: string;
}) {
  const router = useRouter();
  return (
    <div className="border-b bg-background">
      <header className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => router.back()}
          className="grid size-11 place-items-center rounded-lg outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring"
          aria-label="뒤로"
        >
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="text-lg font-bold leading-normal">{title}</h1>
      </header>
      {partyTitle && (
        <section className="mx-auto flex max-w-7xl items-center gap-2 px-4 pb-4 sm:px-6 lg:px-8">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-bold leading-normal">{partyTitle}</h2>
            {(location || startsAt) && (
              <p className="mt-1 truncate text-sm leading-normal text-muted-foreground">
                {location}
                {location && startsAt ? " · " : ""}
                {startsAt ? formatPartyDate(startsAt) : ""}
              </p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
