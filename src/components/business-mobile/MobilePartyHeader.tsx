"use client";

import { ArrowLeft, ChevronRight } from "lucide-react";
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
    <>
      <header className="flex h-14 items-center gap-3 px-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="grid size-8 place-items-center rounded-lg hover:bg-[#f5f5f5]"
          aria-label="뒤로"
        >
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="text-[18px] font-bold leading-[1.5]">{title}</h1>
      </header>
      {partyTitle && (
        <section className="flex items-center gap-2 px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[14px] font-bold leading-[1.5]">{partyTitle}</h2>
            {(location || startsAt) && (
              <p className="mt-1 truncate text-[14px] leading-[1.5] text-[#686868]">
                {location}
                {location && startsAt ? " · " : ""}
                {startsAt ? formatPartyDate(startsAt) : ""}
              </p>
            )}
          </div>
          <ChevronRight className="size-5 shrink-0 text-[#8f8f8f]" />
        </section>
      )}
    </>
  );
}
