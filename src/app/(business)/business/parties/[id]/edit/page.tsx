import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import EditPartyForm from "./EditPartyForm";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditPartyPage({ params }: Props) {
  const { id } = await params;
  const session = await auth();
  const businessId = session!.user.businessId!;

  const party = await prisma.party.findUnique({
    where: { id },
    include: { formFields: { select: { fieldId: true }, orderBy: { order: "asc" } } },
  });

  if (!party || party.businessId !== businessId) notFound();

  const formFields = await prisma.businessFormField.findMany({
    where: { businessId, archived: false },
    orderBy: { order: "asc" },
    select: { id: true, label: true, type: true, required: true },
  });

  const categories = await prisma.partyCategory.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true },
  });

  // datetime-local 입력용으로 로컬 타임존 기준 문자열 변환
  const d = party.date;
  const pad = (n: number) => String(n).padStart(2, "0");
  const dateLocal = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

  return (
    <EditPartyForm
      partyId={party.id}
      formFields={formFields}
      categories={categories}
      defaults={{
        title: party.title,
        description: party.description,
        date: dateLocal,
        location: party.location,
        maxCapacity: party.maxCapacity,
        priceMale: party.priceMale,
        priceFemale: party.priceFemale,
        genderRatio: party.genderRatio ?? "",
        categoryId: party.categoryId ?? "",
        admissionMode: party.admissionMode,
        coverImage: party.coverImage ?? "",
        isActive: party.isActive,
        formFieldIds: party.formFields.map((f) => f.fieldId),
      }}
    />
  );
}
