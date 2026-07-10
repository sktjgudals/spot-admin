import { prisma } from "@/lib/prisma";
import ConfigEditor from "./ConfigEditor";

export default async function SuperAdminConfigPage() {
  const settings = await prisma.appSetting.findMany({ orderBy: { key: "asc" } });

  return (
    <div className="space-y-4 w-full max-w-2xl">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">런타임 설정</h1>
        <p className="text-sm text-muted-foreground">
          재배포 없이 운영 중 바꿀 수 있는 값입니다. 변경은 최대 1분 내 서버에 반영됩니다.
        </p>
      </div>

      <ConfigEditor
        initial={settings.map((s) => ({
          key: s.key,
          value: s.value,
          description: s.description,
        }))}
      />
    </div>
  );
}
