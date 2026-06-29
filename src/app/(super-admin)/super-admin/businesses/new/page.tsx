"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

const schema = z.object({
  name: z.string().min(1, "업체명을 입력하세요"),
  businessNumber: z.string().optional(),
  contactEmail: z.string().email("올바른 이메일").optional().or(z.literal("")),
  contactPhone: z.string().optional(),
  address: z.string().optional(),
  description: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export default function NewBusinessPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormValues) => {
    setLoading(true);
    const res = await fetch("/api/super-admin/businesses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setLoading(false);

    if (res.ok) {
      toast.success("업체가 등록되었습니다");
      router.push("/super-admin/businesses");
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.message ?? "업체 등록에 실패했습니다");
    }
  };

  return (
    <div className="space-y-4 max-w-xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" render={<Link href="/super-admin/businesses" />}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h1 className="text-2xl font-bold">업체 등록</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">업체 정보</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>업체명 *</Label>
              <Input placeholder="예) 파티플래닝 코리아" {...register("name")} />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>사업자등록번호</Label>
              <Input placeholder="000-00-00000" {...register("businessNumber")} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>담당자 이메일</Label>
                <Input type="email" {...register("contactEmail")} />
                {errors.contactEmail && (
                  <p className="text-xs text-destructive">
                    {errors.contactEmail.message}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>연락처</Label>
                <Input placeholder="010-0000-0000" {...register("contactPhone")} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>주소</Label>
              <Input {...register("address")} />
            </div>
            <div className="space-y-1.5">
              <Label>업체 소개</Label>
              <Textarea rows={3} {...register("description")} />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" type="button" onClick={() => router.back()}>
                취소
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "등록 중..." : "업체 등록"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
