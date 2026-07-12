"use client";

import { useEffect, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PartyImageUploader } from "@/components/party-image-uploader";

const schema = z.object({
  title: z.string().min(1, "파티명을 입력하세요"),
  description: z.string().min(1, "파티 소개를 입력하세요"),
  date: z.string().min(1, "날짜를 선택하세요"),
  location: z.string().min(1, "장소를 입력하세요"),
  maxCapacity: z.number().min(2, "최소 2명 이상"),
  priceMale: z.number().min(0),
  priceFemale: z.number().min(0),
  genderRatio: z.string().optional(),
  categoryId: z.string().optional(),
  admissionMode: z.enum(["INSTANT", "APPROVAL"]),
  coverImage: z.string().optional(),
  images: z.array(z.string()).optional(),
  adminId: z.string().min(1, "담당자를 선택하세요"),
});

type FormValues = z.infer<typeof schema>;

interface FormFieldItem {
  id: string;
  label: string;
  type: string;
  required: boolean;
}

interface CategoryItem {
  id: string;
  name: string;
}

interface HostCandidate {
  id: string;
  nickname: string;
  email: string;
}

export default function NewPartyForm({
  hostCandidates,
}: {
  hostCandidates: HostCandidate[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formFields, setFormFields] = useState<FormFieldItem[]>([]);
  const [selectedFieldIds, setSelectedFieldIds] = useState<string[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);

  useEffect(() => {
    fetch("/api/business/forms")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: FormFieldItem[]) => setFormFields(data))
      .catch(() => setFormFields([]));
    fetch("/api/party-categories")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: CategoryItem[]) => setCategories(data))
      .catch(() => setCategories([]));
  }, []);

  const toggleField = (id: string) =>
    setSelectedFieldIds((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]
    );

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      admissionMode: "APPROVAL",
      priceMale: 0,
      priceFemale: 0,
      coverImage: "",
      images: [],
      adminId: hostCandidates.length === 1 ? hostCandidates[0].id : "",
    },
  });

  const coverImage = watch("coverImage") ?? "";
  const images = watch("images") ?? [];

  const onSubmit = async (data: FormValues) => {
    if (hostCandidates.length === 0) {
      toast.error(
        "연결 가능한 담당자가 없습니다. 앱 계정 이메일을 업체 AdminAccount/contactEmail과 맞춰 주세요.",
      );
      return;
    }
    setLoading(true);
    const res = await fetch("/api/business/parties", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...data,
        date: new Date(data.date).toISOString(),
        formFieldIds: selectedFieldIds,
        coverImage: data.coverImage || null,
        images: data.images ?? [],
      }),
    });
    setLoading(false);

    if (res.ok) {
      toast.success("파티가 등록되었습니다");
      router.push("/business/parties");
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.message ?? "파티 등록에 실패했습니다");
    }
  };

  return (
    <div className="space-y-4 w-full max-w-xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" nativeButton={false} render={<Link href="/business/parties" />}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h1 className="text-xl sm:text-2xl font-bold">파티 등록</h1>
      </div>

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-base">파티 정보</CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>담당자 (호스트) *</Label>
              <Select
                value={watch("adminId") || undefined}
                onValueChange={(v) => v && setValue("adminId", v, { shouldValidate: true })}
                disabled={hostCandidates.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="담당자 선택" />
                </SelectTrigger>
                <SelectContent>
                  {hostCandidates.length === 0 ? (
                    <SelectItem value="_none" disabled>
                      연결 가능한 담당자가 없습니다
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
              {errors.adminId && (
                <p className="text-xs text-destructive">{errors.adminId.message}</p>
              )}
              <p className="text-xs text-muted-foreground">
                {hostCandidates.length === 0
                  ? "앱 계정 이메일을 업체 AdminAccount 또는 contactEmail과 맞추거나, 업체에 ADMIN 유저를 지정해 주세요."
                  : "업체 어드민(패널) 이메일과 일치하는 spot 앱 계정, 또는 업체에 지정된 ADMIN 유저 중에서 선택합니다."}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>파티명 *</Label>
              <Input placeholder="예) 2030 소개팅 파티" {...register("title")} />
              {errors.title && (
                <p className="text-xs text-destructive">{errors.title.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>파티 소개 *</Label>
              <Textarea rows={4} {...register("description")} />
              {errors.description && (
                <p className="text-xs text-destructive">{errors.description.message}</p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>일시 *</Label>
                <Input type="datetime-local" {...register("date")} />
                {errors.date && (
                  <p className="text-xs text-destructive">{errors.date.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>최대 인원 *</Label>
                <Input type="number" min={2} {...register("maxCapacity", { valueAsNumber: true })} />
                {errors.maxCapacity && (
                  <p className="text-xs text-destructive">{errors.maxCapacity.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>장소 *</Label>
              <Input placeholder="예) 서울 강남구 역삼동" {...register("location")} />
              {errors.location && (
                <p className="text-xs text-destructive">{errors.location.message}</p>
              )}
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
                <Label>카테고리</Label>
                <Select
                  onValueChange={(v) =>
                    v && setValue("categoryId", v === "none" ? undefined : (v as string))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="미지정" />
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
                <Label>성비</Label>
                <Input placeholder="예) 남3:여3" {...register("genderRatio")} />
              </div>
              <div className="space-y-1.5">
                <Label>입장 방식</Label>
                <Select
                  defaultValue="APPROVAL"
                  onValueChange={(v) =>
                    v && setValue("admissionMode", v as "INSTANT" | "APPROVAL")
                  }
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
              <Label>커버 이미지</Label>
              <PartyImageUploader
                mode="single"
                value={coverImage}
                onChange={(url) => setValue("coverImage", url)}
                uploadUrl="/api/business/parties/media-upload-url"
              />
            </div>

            <div className="space-y-1.5">
              <Label>상세 이미지</Label>
              <PartyImageUploader
                mode="multiple"
                value={images}
                onChange={(urls) => setValue("images", urls)}
                uploadUrl="/api/business/parties/media-upload-url"
                maxFiles={10}
              />
            </div>

            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <Label>신청 폼 질문</Label>
                <Link href="/business/forms" className="text-xs text-primary underline">
                  질문 관리
                </Link>
              </div>
              {formFields.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  등록된 질문이 없습니다. &lsquo;질문 관리&rsquo;에서 먼저 추가하세요.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {formFields.map((f) => (
                    <label key={f.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={selectedFieldIds.includes(f.id)}
                        onChange={() => toggleField(f.id)}
                      />
                      {f.label}
                      {f.required && <span className="text-xs text-destructive">필수</span>}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
              <Button variant="outline" type="button" onClick={() => router.back()}>
                취소
              </Button>
              <Button type="submit" disabled={loading || hostCandidates.length === 0}>
                {loading ? "등록 중..." : "파티 등록"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
