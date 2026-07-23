"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  createParty,
  updateParty,
  type AdminParty,
  type AdmissionMode,
} from "@/auth/api/admin-party.api";
import { AdminAuthError } from "@/auth/model/admin-auth.errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const schema = z.object({
  title: z.string().min(1, "제목 필수").max(200),
  description: z.string().min(1, "설명 필수").max(10000),
  date: z.string().min(1, "일시 필수"),
  location: z.string().min(1, "장소 필수").max(500),
  maxCapacity: z.coerce.number().int().min(1),
  priceMale: z.coerce.number().int().min(0).optional(),
  priceFemale: z.coerce.number().int().min(0).optional(),
  admissionMode: z.enum(["APPROVAL", "INSTANT"]),
  placeName: z.string().optional(),
  address: z.string().optional(),
  isActive: z.boolean().optional(),
});

type FormValues = z.infer<typeof schema>;

function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type Props = {
  mode: "create" | "edit";
  businessId: string;
  party?: AdminParty;
  /** After save */
  successHref: (partyId: string) => string;
  cancelHref: string;
};

export function PartyForm({
  mode,
  businessId,
  party,
  successHref,
  cancelHref,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    // zod v4 + coerce typing noise — runtime validation still applied
    resolver: zodResolver(schema) as never,
    defaultValues: party
      ? {
          title: party.title,
          description: party.description,
          date: toLocalInputValue(party.date),
          location: party.location,
          maxCapacity: party.maxCapacity,
          priceMale: party.priceMale,
          priceFemale: party.priceFemale,
          admissionMode: party.admissionMode as AdmissionMode,
          placeName: party.placeName ?? "",
          address: party.address ?? "",
          isActive: party.isActive,
        }
      : {
          admissionMode: "APPROVAL",
          maxCapacity: 20,
          priceMale: 0,
          priceFemale: 0,
          isActive: true,
        },
  });

  const onSubmit = async (data: FormValues) => {
    setLoading(true);
    try {
      const dateIso = new Date(data.date).toISOString();
      if (mode === "create") {
        const created = await createParty(businessId, {
          title: data.title.trim(),
          description: data.description.trim(),
          date: dateIso,
          location: data.location.trim(),
          maxCapacity: data.maxCapacity,
          priceMale: data.priceMale ?? 0,
          priceFemale: data.priceFemale ?? 0,
          admissionMode: data.admissionMode,
          placeName: data.placeName?.trim() || undefined,
          address: data.address?.trim() || undefined,
        });
        toast.success("파티가 생성되었습니다");
        router.replace(successHref(created.id));
      } else if (party) {
        const updated = await updateParty(party.id, {
          title: data.title.trim(),
          description: data.description.trim(),
          date: dateIso,
          location: data.location.trim(),
          maxCapacity: data.maxCapacity,
          priceMale: data.priceMale ?? 0,
          priceFemale: data.priceFemale ?? 0,
          admissionMode: data.admissionMode,
          placeName: data.placeName?.trim() || undefined,
          address: data.address?.trim() || undefined,
          isActive: data.isActive,
        });
        toast.success("저장되었습니다");
        router.replace(successHref(updated.id));
      }
    } catch (err) {
      toast.error(
        err instanceof AdminAuthError ? err.message : "저장에 실패했습니다",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>
          {mode === "create" ? "파티 등록" : "파티 수정"}
        </CardTitle>
        <CardDescription className="font-mono text-xs break-all">
          businessId={businessId}
          {party ? ` · partyId=${party.id}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <Field label="제목 *" error={errors.title?.message}>
            <Input {...register("title")} />
          </Field>
          <Field label="설명 *" error={errors.description?.message}>
            <Textarea rows={4} {...register("description")} />
          </Field>
          <Field label="일시 *" error={errors.date?.message}>
            <Input type="datetime-local" {...register("date")} />
          </Field>
          <Field label="장소 *" error={errors.location?.message}>
            <Input {...register("location")} />
          </Field>
          <Field label="정원 *" error={errors.maxCapacity?.message}>
            <Input type="number" {...register("maxCapacity")} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="남성 가격">
              <Input type="number" {...register("priceMale")} />
            </Field>
            <Field label="여성 가격">
              <Input type="number" {...register("priceFemale")} />
            </Field>
          </div>
          <Field label="참가 방식">
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              {...register("admissionMode")}
            >
              <option value="APPROVAL">APPROVAL</option>
              <option value="INSTANT">INSTANT</option>
            </select>
          </Field>
          <Field label="장소명 (상세)">
            <Input {...register("placeName")} />
          </Field>
          <Field label="주소">
            <Input {...register("address")} />
          </Field>
          {mode === "edit" && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...register("isActive")} />
              활성 (isActive)
            </label>
          )}
          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={loading}>
              {loading ? "저장 중…" : "저장"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              nativeButton={false}
              render={<Link href={cancelHref} />}
            >
              취소
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
