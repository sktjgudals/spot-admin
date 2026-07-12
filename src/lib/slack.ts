import "server-only";

type ErrorSource = "admin" | "admin (client)";

/**
 * 에러를 Slack 웹훅으로 전송한다 (서버 전용).
 * 제목에 출처([admin])와 환경을 표기해 api/app/admin 중 어디서 난 오류인지 구분한다.
 * SLACK_ERROR_WEBHOOK_URL 미설정 또는 전송 실패는 조용히 무시한다.
 */
export async function notifySlackError(p: {
  source?: ErrorSource;
  title: string;
  detail?: string;
  fields?: Record<string, string | undefined>;
}): Promise<void> {
  const webhook = process.env.SLACK_ERROR_WEBHOOK_URL;
  if (!webhook) return;

  const env = process.env.NODE_ENV === "production" ? "prod" : "dev";
  const source = p.source ?? "admin";
  const lines = [`:rotating_light: *[${source}][${env}]* ${p.title}`];

  if (p.fields) {
    for (const [k, v] of Object.entries(p.fields)) {
      if (v) lines.push(`*${k}:* ${v}`);
    }
  }
  if (p.detail) {
    lines.push("```" + p.detail.slice(0, 2500) + "```");
  }

  try {
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: lines.join("\n") }),
    });
  } catch {
    // 무시
  }
}
