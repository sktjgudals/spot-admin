"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
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
import { PartyOperationsPanel } from "./PartyOperationsPanel";
import { BusinessUserReviewsPanel } from "./BusinessUserReviewsPanel";
import { PartyImageUploader } from "@/components/party-image-uploader";
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
  endsAt: z.string().min(1, "종료 일시 필수"),
  location: z.string().min(1, "장소 필수").max(500),
  maxCapacity: z.coerce.number().int().min(2).max(100),
  priceMale: z.coerce.number().int().min(0).optional(),
  priceFemale: z.coerce.number().int().min(0).optional(),
  admissionMode: z.enum(["APPROVAL", "INSTANT"]),
  placeName: z.string().optional(),
  address: z.string().optional(),
  interestLimit: z.coerce.number().int().min(1).max(20).optional(),
  genderRatio: z.string().optional(),
  maxMale: z.coerce.number().int().min(0).optional().or(z.literal("")),
  maxFemale: z.coerce.number().int().min(0).optional().or(z.literal("")),
  minBirthYear: z.coerce.number().int().min(1950).max(2015).optional().or(z.literal("")),
  maxBirthYear: z.coerce.number().int().min(1950).max(2015).optional().or(z.literal("")),
}).refine((value) => new Date(value.endsAt) > new Date(value.date), {
  message: "종료 일시는 시작 일시보다 늦어야 합니다",
  path: ["endsAt"],
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
  const [images, setImages] = useState<string[]>(() => {
    if (party?.images?.length) return [...party.images];
    if (party?.coverImage) return [party.coverImage];
    return [];
  });
  const [inclusions, setInclusions] = useState<string[]>(
    party?.inclusions?.map((item) => item.label) ?? [],
  );
  const [faqs, setFaqs] = useState<Array<{ question: string; answer: string }>>(
    party?.faqs?.map(({ question, answer }) => ({ question, answer })) ?? [],
  );
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeResults, setPlaceResults] = useState<
    Array<{
      id: string;
      placeName: string;
      address: string;
      locationLabel: string;
      latitude: number;
      longitude: number;
    }>
  >([]);
  const [placeSearching, setPlaceSearching] = useState(false);
  const [placeCoords, setPlaceCoords] = useState<{
    latitude: number;
    longitude: number;
    kakaoId: string;
  } | null>(() =>
    party?.placeLatitude != null && party?.placeLongitude != null
      ? {
          latitude: party.placeLatitude,
          longitude: party.placeLongitude,
          kakaoId: party.placeKakaoId ?? "",
        }
      : null,
  );

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    // zod v4 + coerce typing noise — runtime validation still applied
    resolver: zodResolver(schema) as never,
    defaultValues: party
      ? {
          title: party.title,
          description: party.description,
          date: toLocalInputValue(party.date),
          endsAt: toLocalInputValue(party.endsAt),
          location: party.location,
          maxCapacity: party.maxCapacity,
          priceMale: party.priceMale,
          priceFemale: party.priceFemale,
          admissionMode: party.admissionMode as AdmissionMode,
          placeName: party.placeName ?? "",
          address: party.address ?? "",
          interestLimit: party.interestLimit ?? 3,
          genderRatio: party.genderRatio ?? "",
          maxMale: party.maxMale ?? undefined,
          maxFemale: party.maxFemale ?? undefined,
          minBirthYear: party.minBirthYear ?? undefined,
          maxBirthYear: party.maxBirthYear ?? undefined,
        }
      : {
          admissionMode: "APPROVAL",
          maxCapacity: 20,
          priceMale: 0,
          priceFemale: 0,
          interestLimit: 3,
        },
  });

  function optionalInt(v: unknown): number | null | undefined {
    if (v === "" || v === undefined || v === null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  const watchedPlaceName = watch("placeName");
  const watchedAddress = watch("address");

  async function searchPlaces() {
    const q = placeQuery.trim();
    if (q.length < 1) {
      toast.error("검색어를 입력해 주세요");
      return;
    }
    setPlaceSearching(true);
    try {
      // Nest admin JWT — single KakaoLocalService (no Next BFF duplicate)
      const { adminFetchJson } = await import("@/auth/api/admin-http");
      const { NestAdminApi } = await import("@/auth/model/admin-routes");
      const data = await adminFetchJson<
        Array<{
          id: string;
          placeName: string;
          address: string;
          locationLabel: string;
          latitude: number;
          longitude: number;
        }>
      >(
        `${NestAdminApi.placesKakaoSearch()}?query=${encodeURIComponent(q)}&size=12`,
      );
      setPlaceResults(data);
      if (data.length === 0) toast.message("검색 결과가 없어요");
    } catch {
      toast.error("장소 검색에 실패했어요. 로그인·카카오 REST 키를 확인해 주세요");
      setPlaceResults([]);
    } finally {
      setPlaceSearching(false);
    }
  }

  function selectPlace(item: {
    id: string;
    placeName: string;
    address: string;
    locationLabel: string;
    latitude: number;
    longitude: number;
  }) {
    setValue("location", item.locationLabel, { shouldValidate: true });
    setValue("placeName", item.placeName, { shouldValidate: true });
    setValue("address", item.address, { shouldValidate: true });
    setPlaceCoords({
      latitude: item.latitude,
      longitude: item.longitude,
      kakaoId: item.id,
    });
    setPlaceResults([]);
    setPlaceQuery(item.placeName);
    toast.success("장소가 선택되었습니다");
  }

  const onSubmit = async (data: FormValues) => {
    const normalizedInclusions = inclusions
      .map((label) => label.trim())
      .filter(Boolean)
      .map((label) => ({ label }));
    const normalizedFaqs = faqs.map(({ question, answer }) => ({
      question: question.trim(),
      answer: answer.trim(),
    }));
    if (
      normalizedFaqs.some(
        ({ question, answer }) => question.length === 0 || answer.length === 0,
      )
    ) {
      toast.error("FAQ의 질문과 답변을 모두 입력해 주세요");
      return;
    }

    setLoading(true);
    try {
      const dateIso = new Date(data.date).toISOString();
      const endsAtIso = new Date(data.endsAt).toISOString();
      if (mode === "create") {
        const created = await createParty(businessId, {
          title: data.title.trim(),
          description: data.description.trim(),
          date: dateIso,
          endsAt: endsAtIso,
          location: data.location.trim(),
          maxCapacity: data.maxCapacity,
          priceMale: data.priceMale ?? 0,
          priceFemale: data.priceFemale ?? 0,
          admissionMode: data.admissionMode,
          placeName: data.placeName?.trim() || undefined,
          address: data.address?.trim() || undefined,
          placeLatitude: placeCoords?.latitude,
          placeLongitude: placeCoords?.longitude,
          placeKakaoId: placeCoords?.kakaoId || undefined,
          interestLimit: data.interestLimit,
          genderRatio: data.genderRatio?.trim() || undefined,
          maxMale: optionalInt(data.maxMale),
          maxFemale: optionalInt(data.maxFemale),
          minBirthYear: optionalInt(data.minBirthYear),
          maxBirthYear: optionalInt(data.maxBirthYear),
          images,
          coverImage: images[0],
          inclusions: normalizedInclusions,
          faqs: normalizedFaqs,
        });
        toast.success("파티가 생성되었습니다");
        router.replace(successHref(created.id));
      } else if (party) {
        const updated = await updateParty(party.id, {
          title: data.title.trim(),
          description: data.description.trim(),
          date: dateIso,
          endsAt: endsAtIso,
          location: data.location.trim(),
          maxCapacity: data.maxCapacity,
          priceMale: data.priceMale ?? 0,
          priceFemale: data.priceFemale ?? 0,
          admissionMode: data.admissionMode,
          placeName: data.placeName?.trim() || undefined,
          address: data.address?.trim() || undefined,
          placeLatitude: placeCoords?.latitude,
          placeLongitude: placeCoords?.longitude,
          placeKakaoId: placeCoords?.kakaoId || undefined,
          interestLimit: data.interestLimit,
          genderRatio: data.genderRatio?.trim() || undefined,
          maxMale: optionalInt(data.maxMale),
          maxFemale: optionalInt(data.maxFemale),
          minBirthYear: optionalInt(data.minBirthYear),
          maxBirthYear: optionalInt(data.maxBirthYear),
          images,
          coverImage: images[0],
          inclusions: normalizedInclusions,
          faqs: normalizedFaqs,
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
    <div className="space-y-4">
    <Card className="max-w-2xl">
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
          <Field label="시작 일시 *" error={errors.date?.message}>
            <Input type="datetime-local" {...register("date")} />
          </Field>
          <Field label="종료 일시 *" error={errors.endsAt?.message}>
            <Input type="datetime-local" {...register("endsAt")} />
          </Field>
          <Field label="장소 검색 (카카오맵)">
            <div className="flex gap-2">
              <Input
                value={placeQuery}
                onChange={(e) => setPlaceQuery(e.target.value)}
                placeholder="예: 강남역 카페"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void searchPlaces();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={placeSearching}
                onClick={() => void searchPlaces()}
              >
                {placeSearching ? "검색 중…" : "검색"}
              </Button>
            </div>
            {placeResults.length > 0 && (
              <ul className="mt-2 max-h-48 overflow-auto rounded-md border bg-background text-sm">
                {placeResults.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left hover:bg-muted"
                      onClick={() => selectPlace(item)}
                    >
                      <div className="font-medium">{item.placeName}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.address}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              선택 시 공개 위치·상세 주소·좌표가 자동 입력됩니다. 확정 참가자만 상세
              주소를 봅니다.
            </p>
          </Field>
          <Field label="공개 위치 (목록) *" error={errors.location?.message}>
            <Input {...register("location")} placeholder="예: 서울 강남구" />
          </Field>
          <Field label="장소명 (상세 · 확정 후 공개)">
            <Input {...register("placeName")} />
          </Field>
          <Field label="주소 (상세 · 확정 후 공개)">
            <Input {...register("address")} />
          </Field>
          {(watchedPlaceName || watchedAddress || placeCoords) && (
            <p className="text-xs text-muted-foreground">
              {placeCoords
                ? `좌표: ${placeCoords.latitude.toFixed(5)}, ${placeCoords.longitude.toFixed(5)}`
                : "좌표 없음 — 검색으로 다시 선택하면 지도 연동이 됩니다"}
            </p>
          )}
          <Field label="정원 *" error={errors.maxCapacity?.message}>
            <Input type="number" {...register("maxCapacity")} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="남성 정원 (선택)">
              <Input type="number" placeholder="제한 없음" {...register("maxMale")} />
            </Field>
            <Field label="여성 정원 (선택)">
              <Input type="number" placeholder="제한 없음" {...register("maxFemale")} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="신청 최소 출생연도">
              <Input type="number" placeholder="예: 1995" {...register("minBirthYear")} />
            </Field>
            <Field label="신청 최대 출생연도">
              <Input type="number" placeholder="예: 2005" {...register("maxBirthYear")} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="호감 선택 상한">
              <Input type="number" {...register("interestLimit")} />
            </Field>
            <Field label="성비 안내 (선택)">
              <Input placeholder="예: 1:1" {...register("genderRatio")} />
            </Field>
          </div>
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
          <Field label="커버 이미지 (최대 10장)">
            <PartyImageUploader
              mode="multiple"
              maxFiles={10}
              value={images}
              onChange={setImages}
              uploadUrl="/api/business/parties/media-upload-url"
            />
          </Field>
          <section className="space-y-3 rounded-lg border bg-muted/20 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold">포함 사항</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  앱 파티 상세에 입력 순서대로 칩 형태로 표시됩니다.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={inclusions.length >= 20}
                onClick={() => setInclusions((items) => [...items, ""])}
              >
                <Plus className="size-4" />
                추가
              </Button>
            </div>
            {inclusions.length === 0 ? (
              <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
                등록된 포함 사항이 없습니다.
              </p>
            ) : (
              <div className="space-y-2">
                {inclusions.map((label, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      aria-label={`포함 사항 ${index + 1}`}
                      maxLength={80}
                      placeholder="예: 웰컴 드링크"
                      value={label}
                      onChange={(event) =>
                        setInclusions((items) =>
                          items.map((item, itemIndex) =>
                            itemIndex === index ? event.target.value : item,
                          ),
                        )
                      }
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`포함 사항 ${index + 1} 삭제`}
                      onClick={() =>
                        setInclusions((items) =>
                          items.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section className="space-y-3 rounded-lg border bg-muted/20 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold">자주 묻는 질문</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  질문은 아코디언 제목으로, 답변은 펼쳤을 때 표시됩니다.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={faqs.length >= 20}
                onClick={() =>
                  setFaqs((items) => [...items, { question: "", answer: "" }])
                }
              >
                <Plus className="size-4" />
                질문 추가
              </Button>
            </div>
            {faqs.length === 0 ? (
              <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
                등록된 FAQ가 없습니다.
              </p>
            ) : (
              <div className="space-y-3">
                {faqs.map((faq, index) => (
                  <div key={index} className="space-y-2 rounded-md border bg-background p-3">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 space-y-2">
                        <Input
                          aria-label={`FAQ ${index + 1} 질문`}
                          maxLength={200}
                          placeholder="질문을 입력하세요"
                          value={faq.question}
                          onChange={(event) =>
                            setFaqs((items) =>
                              items.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, question: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                        <Textarea
                          aria-label={`FAQ ${index + 1} 답변`}
                          maxLength={2000}
                          rows={3}
                          placeholder="답변을 입력하세요"
                          value={faq.answer}
                          onChange={(event) =>
                            setFaqs((items) =>
                              items.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, answer: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={`FAQ ${index + 1} 삭제`}
                        onClick={() =>
                          setFaqs((items) =>
                            items.filter((_, itemIndex) => itemIndex !== index),
                          )
                        }
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
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
    {mode === "edit" && party && <PartyOperationsPanel party={party} />}
    {mode === "edit" && party?.canBusinessReview && <BusinessUserReviewsPanel partyId={party.id} />}
    </div>
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
