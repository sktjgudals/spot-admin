"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod/mini";
import { formResolver } from "@/lib/form-resolver";
import { toast } from "sonner";
import { useAdminMutation } from "@/auth/query/use-admin-mutation";
import { RoleGuard } from "@/auth/guards/RoleGuard";
import { SUPER_ADMIN_ONLY } from "@/auth/model/admin-auth.types";
import {
  assignBusinessAdmin,
  createBusiness,
  type BusinessAdminCandidate,
} from "@/auth/api/admin-business.api";
import { businessDetailPath } from "@/auth/model/admin-routes";
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
import { BusinessAdminPicker } from "@/components/admin/BusinessAdminPicker";

const schema = z.object({
  name: z.string().check(
    z.minLength(1, "업체명을 입력하세요"),
    z.maxLength(200),
  ),
  kind: z.enum(["COMPANY", "INDIVIDUAL"]),
  tagline: z.optional(z.string().check(z.maxLength(200))),
  description: z.optional(z.string().check(z.maxLength(2000))),
  contactEmail: z.optional(
    z.union([z.email("올바른 이메일"), z.literal("")]),
  ),
  contactPhone: z.optional(z.string().check(z.maxLength(40))),
  businessNumber: z.optional(z.string().check(z.maxLength(40))),
  feeRateBps: z.optional(
    z.coerce
      .number()
      .check(z.int(), z.minimum(0), z.maximum(10_000)),
  ),
});

type FormValues = z.infer<typeof schema>;

export default function NewBusinessPage() {
  return (
    <RoleGuard allow={SUPER_ADMIN_ONLY}>
      <NewBusinessForm />
    </RoleGuard>
  );
}

function NewBusinessForm() {
  const router = useRouter();
  const [selectedAdmin, setSelectedAdmin] =
    useState<BusinessAdminCandidate | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: formResolver<FormValues>(schema),
    defaultValues: { kind: "COMPANY", feeRateBps: 1000 },
  });

  const save = useAdminMutation({
    mutationFn: async (data: FormValues) => {
      const created = await createBusiness({
        name: data.name.trim(),
        kind: data.kind,
        tagline: data.tagline?.trim() || undefined,
        description: data.description?.trim() || undefined,
        contactEmail: data.contactEmail?.trim() || undefined,
        contactPhone: data.contactPhone?.trim() || undefined,
        businessNumber: data.businessNumber?.trim() || undefined,
        feeRateBps: data.feeRateBps,
      });
      if (!selectedAdmin) {
        return { created, assignment: "skipped" as const };
      }
      try {
        await assignBusinessAdmin(created.id, selectedAdmin.id);
        return {
          created,
          assignment: "ok" as const,
          nickname: selectedAdmin.nickname,
        };
      } catch (assignmentError) {
        return { created, assignment: "failed" as const, assignmentError };
      }
    },
    errorMessage: "생성에 실패했습니다",
    onSuccess: (result) => {
      if (result.assignment === "ok") {
        toast.success(
          `업체를 생성하고 ${result.nickname}님을 관리자로 할당했습니다.`,
        );
      } else if (result.assignment === "failed") {
        toast.error(
          result.assignmentError instanceof AdminAuthError
            ? `업체는 생성됐지만 관리자 할당에 실패했습니다: ${result.assignmentError.message}`
            : "업체는 생성됐지만 관리자 할당에 실패했습니다. 상세 화면에서 다시 시도하세요.",
        );
      } else {
        toast.success(
          "업체가 생성되었습니다. 상세 화면에서 관리자를 할당할 수 있습니다.",
        );
      }
      router.replace(businessDetailPath(result.created.id));
    },
  });

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>업체 등록</CardTitle>
        <CardDescription>
          기존 가입자를 검색해 바로 업체 관리자로 할당하거나, 생성 후 이메일로
          초대할 수 있습니다.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit((data) => save.mutate(data))} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">업체명 *</Label>
            <Input id="name" {...register("name")} />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="kind">종류</Label>
            <select
              id="kind"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              {...register("kind")}
            >
              <option value="COMPANY">COMPANY</option>
              <option value="INDIVIDUAL">INDIVIDUAL</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tagline">한줄 소개</Label>
            <Input id="tagline" {...register("tagline")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">소개</Label>
            <Textarea id="description" rows={3} {...register("description")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contactEmail">연락 이메일</Label>
            <Input
              id="contactEmail"
              type="email"
              {...register("contactEmail")}
            />
            {errors.contactEmail && (
              <p className="text-xs text-destructive">
                {errors.contactEmail.message}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contactPhone">연락 전화</Label>
            <Input id="contactPhone" {...register("contactPhone")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="businessNumber">사업자번호</Label>
            <Input id="businessNumber" {...register("businessNumber")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="feeRateBps">수수료 (bps, 1000=10%)</Label>
            <Input id="feeRateBps" type="number" {...register("feeRateBps")} />
          </div>
          <div className="space-y-2 rounded-lg border p-3">
            <div>
              <Label>업체 관리자 선택</Label>
              <p className="text-xs text-muted-foreground">
                선택 사항입니다. 활성 상태인 기존 사용자만 할당할 수 있습니다.
              </p>
            </div>
            <BusinessAdminPicker
              selectedUserId={selectedAdmin?.id}
              onSelect={setSelectedAdmin}
              disabled={save.isPending}
            />
            {selectedAdmin && (
              <div className="flex items-center justify-between gap-2 rounded-md bg-muted p-2 text-sm">
                <span>
                  선택: {selectedAdmin.nickname} ·{" "}
                  {selectedAdmin.email ?? "이메일 없음"}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setSelectedAdmin(null)}
                  disabled={save.isPending}
                >
                  선택 해제
                </Button>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "생성 중…" : "생성"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              nativeButton={false}
              render={<Link href="/app/businesses" />}
            >
              취소
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
