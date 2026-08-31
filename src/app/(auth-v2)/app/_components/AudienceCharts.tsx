import type { AgeBand, AudienceBreakdown } from "@/auth/api/business-insights.api";

const AGE_LABEL: Record<AgeBand, string> = {
  "10s": "10대",
  "20s": "20대",
  "30s": "30대",
  "40s": "40대",
  "50s+": "50대+",
  unknown: "미입력",
};

const AGE_ORDER: AgeBand[] = ["10s", "20s", "30s", "40s", "50s+", "unknown"];

type Props = {
  title: string;
  breakdown: AudienceBreakdown;
  emptyLabel: string;
};

export function AudienceCharts({ title, breakdown, emptyLabel }: Props) {
  if (breakdown.totalUsers === 0) {
    return (
      <section className="rounded-2xl border bg-card px-5 py-6 text-card-foreground">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{emptyLabel}</p>
      </section>
    );
  }

  const maxAge = Math.max(...AGE_ORDER.map((band) => breakdown.ageBands[band]), 1);
  const genderTotal =
    breakdown.gender.male + breakdown.gender.female + breakdown.gender.unknown || 1;

  return (
    <section className="rounded-2xl border bg-card px-5 py-6 text-card-foreground" aria-label={`${title} 분석`}>
      <div className="flex items-end justify-between gap-3">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-sm font-medium tabular-nums text-primary">
          {breakdown.totalUsers}명
        </p>
      </div>

      <div className="mt-4 grid grid-cols-[72px_1fr] items-center gap-3">
        <Donut
          male={breakdown.gender.male}
          female={breakdown.gender.female}
          unknown={breakdown.gender.unknown}
          total={genderTotal}
        />
        <ul className="space-y-1.5 text-sm text-foreground">
          <li className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-chart-1" aria-hidden />
            남성 {breakdown.gender.male}
          </li>
          <li className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-chart-2" aria-hidden />
            여성 {breakdown.gender.female}
          </li>
          <li className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-muted-foreground" aria-hidden />
            미입력 {breakdown.gender.unknown}
          </li>
        </ul>
      </div>

      <ul className="mt-5 space-y-2">
        {AGE_ORDER.filter((band) => breakdown.ageBands[band] > 0).map((band) => {
          const count = breakdown.ageBands[band];
          const width = Math.round((count / maxAge) * 100);
          return (
            <li key={band} className="grid grid-cols-[52px_1fr_28px] items-center gap-2">
              <span className="text-xs text-muted-foreground">{AGE_LABEL[band]}</span>
              <div className="h-2 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${width}%` }}
                />
              </div>
              <span className="text-right text-xs tabular-nums text-foreground">
                {count}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Donut({
  male,
  female,
  unknown,
  total,
}: {
  male: number;
  female: number;
  unknown: number;
  total: number;
}) {
  const r = 28;
  const c = 2 * Math.PI * r;
  const maleLen = (male / total) * c;
  const femaleLen = (female / total) * c;
  const unknownLen = (unknown / total) * c;
  return (
    <svg viewBox="0 0 72 72" className="size-[72px]" aria-hidden>
      <circle cx="36" cy="36" r={r} fill="none" strokeWidth="10" className="stroke-muted" />
      <circle
        cx="36"
        cy="36"
        r={r}
        fill="none"
        className="stroke-chart-1"
        strokeWidth="10"
        strokeDasharray={`${maleLen} ${c - maleLen}`}
        strokeDashoffset="0"
        transform="rotate(-90 36 36)"
      />
      <circle
        cx="36"
        cy="36"
        r={r}
        fill="none"
        className="stroke-chart-2"
        strokeWidth="10"
        strokeDasharray={`${femaleLen} ${c - femaleLen}`}
        strokeDashoffset={-maleLen}
        transform="rotate(-90 36 36)"
      />
      <circle
        cx="36"
        cy="36"
        r={r}
        fill="none"
        className="stroke-muted-foreground"
        strokeWidth="10"
        strokeDasharray={`${unknownLen} ${c - unknownLen}`}
        strokeDashoffset={-(maleLen + femaleLen)}
        transform="rotate(-90 36 36)"
      />
    </svg>
  );
}
