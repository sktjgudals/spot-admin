import Link from "next/link";
import { Button } from "@/components/ui/button";

type StatusPageProps = {
  code: string;
  title: string;
  description: string;
  primaryHref?: string;
  primaryLabel?: string;
  onPrimaryClick?: () => void;
  secondaryHref?: string;
  secondaryLabel?: string;
};

/** 404 / 오류 화면 공통 레이아웃 (로그인 화면과 같은 톤) */
export function StatusPage({
  code,
  title,
  description,
  primaryHref = "/",
  primaryLabel = "홈으로",
  onPrimaryClick,
  secondaryHref,
  secondaryLabel,
}: StatusPageProps) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="space-y-2">
          <p className="text-sm font-medium tracking-wide text-muted-foreground">
            Dopa Admin
          </p>
          <p className="tabular-data text-6xl font-semibold tracking-[-0.05em] text-foreground">{code}</p>
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
            {description}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {onPrimaryClick ? (
            <Button type="button" onClick={onPrimaryClick}>
              {primaryLabel}
            </Button>
          ) : (
            <Button nativeButton={false} render={<Link href={primaryHref} />}>
              {primaryLabel}
            </Button>
          )}
          {secondaryHref && secondaryLabel ? (
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={secondaryHref} />}
            >
              {secondaryLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
