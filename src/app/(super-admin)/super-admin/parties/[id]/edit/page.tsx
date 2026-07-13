import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import EditPartyForm from "@/app/(business)/business/parties/[id]/edit/EditPartyForm";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function SuperAdminEditPartyPage({ params }: Props) {
  const { id } = await params;

  const party = await prisma.party.findUnique({
    where: { id },
    include: {
      formFields: { select: { fieldId: true }, orderBy: { order: "asc" } },
      business: { select: { id: true, name: true } },
    },
  });

  if (!party) notFound();

  const [formFields, categories, businesses] = await Promise.all([
    party.businessId
      ? prisma.businessFormField.findMany({
          where: { businessId: party.businessId, archived: false },
          orderBy: { order: "asc" },
          select: { id: true, label: true, type: true, required: true },
        })
      : Promise.resolve([]),
    prisma.partyCategory.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.business.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const d = party.date;
  const pad = (n: number) => String(n).padStart(2, "0");
  const dateLocal = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

  return (
    <EditPartyForm
      partyId={party.id}
      formFields={formFields}
      categories={categories}
      businesses={businesses}
      apiPath={`/api/super-admin/parties/${party.id}`}
      backHref={`/super-admin/parties/${party.id}`}
      uploadUrl="/api/super-admin/parties/media-upload-url"
      formsHref={null}
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
        images: party.images ?? [],
        isActive: party.isActive,
        formFieldIds: party.formFields.map((f) => f.fieldId),
        businessId: party.businessId,
      }}
    />
  );
}
