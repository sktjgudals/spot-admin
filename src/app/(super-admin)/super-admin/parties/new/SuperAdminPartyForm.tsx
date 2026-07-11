"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const schema = z.object({
  title: z.string().min(1, "파티명을 입력하세요"),
  description: z.string().min(1, "파티 소개를 입력하세요"),
  date: z.string().min(1, "날짜를 선택하세요"),
  location: z.string().min(1, "장소를 입력하세요"),
  maxCapacity: z.number().min(2, "최소 2명 이상"),
  priceMale: z.number().min(0),
  priceFemale: z.number().min(0),
  genderRatio: z.string().optional(),
  admissionMode: z.enum(["INSTANT", "APPROVAL"]),
  coverImage: z.string().optional(),
  adminId: z.string().min(1, "호스트를 선택하세요"),
  businessId: z.string().optional(),
  categoryId: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  businesses: { id: string; name: string; contactEmail: string | null }[];
  hostCandidates: { id: string; nickname: string; email: string }[];
  categories: { id: string; name: string }[];
}

export default function SuperAdminPartyForm({
  businesses,
  hostCandidates,
  categories,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { admissionMode: "APPROVAL", priceMale: 0, priceFemale: 0 },
  });

  const onSubmit = async (data: FormValues) => {
    setLoading(true);
    const res = await fetch("/api/super-admin/parties", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, date: new Date(data.date).toISOString() }),
    });
    setLoading(false);

    if (res.ok) {
      toast.success("파티가 등록되었습니다");
      router.push("/super-admin/parties");
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.message ?? "파티 등록에 실패했습니다");
    }
  };

  return (
    <Card>
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="text-base">파티 정보</CardTitle>
      </CardHeader>
      <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label>파티명 *</Label>
            <Input placeholder="예) 2030 소개팅 파티" {...register("title")} />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>파티 소개 *</Label>
            <Textarea rows={3} {...register("description")} />
            {errors.description && <p className="text-xs text-destructive">{errors.description.message}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>일시 *</Label>
              <Input type="datetime-local" {...register("date")} />
              {errors.date && <p className="text-xs text-destructive">{errors.date.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>최대 인원 *</Label>
              <Input type="number" min={2} {...register("maxCapacity", { valueAsNumber: true })} />
              {errors.maxCapacity && <p className="text-xs text-destructive">{errors.maxCapacity.message}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>장소 *</Label>
            <Input placeholder="예) 서울 강남구 역삼동" {...register("location")} />
            {errors.location && <p className="text-xs text-destructive">{errors.location.message}</p>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>남성 참가비 (원)</Label>
              <Input type="number" min={0} {...register("priceMale", { valueAsNumber: true })} />
            </div>
            <div className="space-y-1.5">
              <Label>여성 참가비 (원)</Label>
              <Input type="number" min={0} {...register("priceFemale", { valueAsNumber: true })} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>성비</Label>
              <Input placeholder="예) 남3:여3" {...register("genderRatio")} />
            </div>
            <div className="space-y-1.5">
              <Label>입장 방식</Label>
              <Select
                defaultValue="APPROVAL"
                onValueChange={(v) => v && setValue("admissionMode", v as "INSTANT" | "APPROVAL")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="APPROVAL">승인 후 입장</SelectItem>
                  <SelectItem value="INSTANT">즉시 입장</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>카테고리</Label>
            <Select
              onValueChange={(v) =>
                v && setValue("categoryId", v === "none" ? undefined : (v as string))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="카테고리 미지정" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">미지정</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>커버 이미지 URL</Label>
            <Input type="url" placeholder="https://..." {...register("coverImage")} />
          </div>

          <div className="space-y-1.5">
            <Label>호스트 (spot 유저) *</Label>
            <Select onValueChange={(v) => v && setValue("adminId", v as string)}>
              <SelectTrigger>
                <SelectValue placeholder="호스트 선택" />
              </SelectTrigger>
              <SelectContent>
                {hostCandidates.length === 0 ? (
                  <SelectItem value="_none" disabled>
                    ADMIN 또는 SUPER_ADMIN 유저가 없습니다
                  </SelectItem>
                ) : (
                  hostCandidates.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.nickname} ({u.email})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {errors.adminId && <p className="text-xs text-destructive">{errors.adminId.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>연결 업체 (선택)</Label>
            <Select onValueChange={(v) => v && setValue("businessId", v === "none" ? undefined : (v as string))}>
              <SelectTrigger>
                <SelectValue placeholder="업체 미연결" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">미연결</SelectItem>
                {businesses.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <Button variant="outline" type="button" onClick={() => router.back()}>
              취소
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "등록 중..." : "파티 등록"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
