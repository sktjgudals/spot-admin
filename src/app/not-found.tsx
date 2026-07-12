import type { Metadata } from "next";
import { StatusPage } from "@/components/error/StatusPage";

export const metadata: Metadata = {
  title: "페이지를 찾을 수 없습니다 | Dopa Admin",
};

export default function NotFound() {
  return (
    <StatusPage
      code="404"
      title="페이지를 찾을 수 없습니다"
      description={
        "요청하신 주소가 없거나 이동되었을 수 있습니다.\n주소를 확인하거나 홈으로 돌아가 주세요."
      }
      primaryHref="/"
      primaryLabel="홈으로"
      secondaryHref="/login"
      secondaryLabel="로그인"
    />
  );
}
