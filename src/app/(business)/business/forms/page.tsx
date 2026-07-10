import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import FormsManager from "./FormsManager";

export default async function BusinessFormsPage() {
  const session = await auth();
  const businessId = session!.user.businessId!;

  const fields = await prisma.businessFormField.findMany({
    where: { businessId, archived: false },
    orderBy: { order: "asc" },
  });

  return (
    <div className="space-y-4 w-full max-w-2xl">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">신청 폼 관리</h1>
        <p className="text-sm text-muted-foreground">
          신청자에게 받을 질문을 만들어 파티마다 선택해 사용할 수 있습니다. 신청자는
          같은 업체의 파티에 재신청하면 이전 답변이 자동으로 채워집니다.
        </p>
      </div>

      <FormsManager
        initialFields={fields.map((f) => ({
          id: f.id,
          label: f.label,
          type: f.type,
          options: f.options,
          required: f.required,
        }))}
      />
    </div>
  );
}
