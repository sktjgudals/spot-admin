"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { RoleGuard } from "@/auth/guards/RoleGuard";
import { createBusiness } from "@/auth/api/admin-business.api";
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

const schema = z.object({
  name: z.string().min(1, "업체명을 입력하세요").max(200),
  kind: z.enum(["COMPANY", "INDIVIDUAL"]),
  tagline: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  contactEmail: z.string().email("올바른 이메일").optional().or(z.literal("")),
  contactPhone: z.string().max(40).optional(),
  businessNumber: z.string().max(40).optional(),
  feeRateBps: z.coerce.number().int().min(0).max(10000).optional(),
});

type FormValues = z.infer<typeof schema>;

export default function NewBusinessPage() {
  return (
    <RoleGuard allow={["SUPER_ADMIN"]}>
      <NewBusinessForm />
    </RoleGuard>
  );
}

function NewBusinessForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema) as never,
    defaultValues: { kind: "COMPANY", feeRateBps: 1000 },
  });

  const onSubmit = async (data: FormValues) => {
    setLoading(true);
    try {
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
      toast.success("업체가 생성되었습니다. 초대로 관리자를 추가하세요.");
      router.replace(businessDetailPath(created.id));
    } catch (err) {
      toast.error(
        err instanceof AdminAuthError ? err.message : "생성에 실패했습니다",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>업체 등록</CardTitle>
        <CardDescription>
          Business만 생성됩니다. 관리자는 초대(Invite)로 추가합니다.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
            <Input id="contactEmail" type="email" {...register("contactEmail")} />
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
            <Input
              id="feeRateBps"
              type="number"
              {...register("feeRateBps")}
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={loading}>
              {loading ? "생성 중…" : "생성"}
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
