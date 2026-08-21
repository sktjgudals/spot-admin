"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  createParty,
  listPartyCategories,
  partyQueryKeys,
  updateParty,
  type AdminParty,
  type AdmissionMode,
} from "@/auth/api/admin-party.api";
import { useAdminAuth } from "@/auth/hooks/useAdminAuth";
import { useAdminMutation } from "@/auth/query/use-admin-mutation";
import { PartyImageUploader } from "@/components/party-image-uploader";
import { cn } from "@/lib/utils";

type FormState = {
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  applicationDeadline: string;
  location: string;
  placeName: string;
  address: string;
  maxCapacity: string;
  maxMale: string;
  maxFemale: string;
  minAge: string;
  maxAge: string;
  priceMale: string;
  priceFemale: string;
  interestLimit: string;
  genderRatio: string;
  admissionMode: AdmissionMode;
};

function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function positiveInt(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function birthYearForAge(age: number): number {
  return new Date().getFullYear() - age;
}

function ageFromBirthYear(year: number | null | undefined): string {
  if (year == null) return "";
  return String(new Date().getFullYear() - year);
}

function optionalInt(value: string): number | null {
  const parsed = positiveInt(value);
  return parsed;
}

function formFromParty(party?: AdminParty): FormState {
  if (!party) {
    return {
      title: "",
      description: "",
      startsAt: "",
      endsAt: "",
      applicationDeadline: "",
      location: "",
      placeName: "",
      address: "",
      maxCapacity: "",
      maxMale: "",
      maxFemale: "",
      minAge: "",
      maxAge: "",
      priceMale: "",
      priceFemale: "",
      interestLimit: "3",
      genderRatio: "",
      admissionMode: "APPROVAL",
    };
  }
  return {
    title: party.title,
    description: party.description,
    startsAt: toLocalInputValue(party.date),
    endsAt: toLocalInputValue(party.endsAt),
    applicationDeadline: toLocalInputValue(party.applicationDeadline),
    location: party.location,
    placeName: party.placeName ?? "",
    address: party.address ?? "",
    maxCapacity: String(party.maxCapacity),
    maxMale: party.maxMale == null ? "" : String(party.maxMale),
    maxFemale: party.maxFemale == null ? "" : String(party.maxFemale),
    minAge: ageFromBirthYear(party.maxBirthYear),
    maxAge: ageFromBirthYear(party.minBirthYear),
    priceMale: String(party.priceMale ?? 0),
    priceFemale: String(party.priceFemale ?? 0),
    interestLimit: String(party.interestLimit ?? 3),
    genderRatio: party.genderRatio ?? "",
    admissionMode: party.admissionMode,
  };
}

type Props = {
  mode: "create" | "edit";
  businessId: string;
  party?: AdminParty;
  successHref: (partyId: string) => string;
  cancelHref: string;
};

export function BusinessMobilePartyForm({
  mode,
  businessId,
  party,
  successHref,
  cancelHref,
}: Props) {
  const router = useRouter();
  const { admin } = useAdminAuth();
  const scope = admin?.role === "SUPER_ADMIN" ? "super" : "business";
  const [form, setForm] = useState<FormState>(() => formFromParty(party));
  const categories = useQuery({
    queryKey: partyQueryKeys.categories,
    queryFn: listPartyCategories,
    staleTime: 5 * 60_000,
  });
  const [selectedCategoryId, setSelectedCategoryId] = useState(
    party?.categoryId ?? "",
  );
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
  const [placeQuery, setPlaceQuery] = useState(party?.placeName ?? "");
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
  const categoryId = selectedCategoryId || party?.categoryId || categories.data?.[0]?.id || "";

  const valid = useMemo(() => {
    const capacity = positiveInt(form.maxCapacity);
    return (
      form.title.trim().length > 0 &&
      form.description.trim().length > 0 &&
      form.startsAt.length > 0 &&
      form.endsAt.length > 0 &&
      form.applicationDeadline.length > 0 &&
      form.location.trim().length > 0 &&
      (mode === "edit" || categoryId.length > 0) &&
      capacity !== null &&
      capacity >= 2 &&
      new Date(form.endsAt) > new Date(form.startsAt) &&
      new Date(form.applicationDeadline) <= new Date(form.startsAt)
    );
  }, [categoryId, form, mode]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = useAdminMutation({
    mutationFn: async () => {
      const maxCapacity = positiveInt(form.maxCapacity);
      if (maxCapacity === null) throw new Error("정원을 입력해 주세요");
      const minAge = positiveInt(form.minAge);
      const maxAge = positiveInt(form.maxAge);
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        date: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
        applicationDeadline: new Date(form.applicationDeadline).toISOString(),
        location: form.location.trim(),
        maxCapacity,
        maxMale: optionalInt(form.maxMale),
        maxFemale: optionalInt(form.maxFemale),
        minBirthYear: maxAge === null ? null : birthYearForAge(maxAge),
        maxBirthYear: minAge === null ? null : birthYearForAge(minAge),
        priceMale: positiveInt(form.priceMale) ?? 0,
        priceFemale: positiveInt(form.priceFemale) ?? 0,
        admissionMode: form.admissionMode,
        categoryId: categoryId || undefined,
        placeName: form.placeName.trim() || undefined,
        address: form.address.trim() || undefined,
        placeLatitude: placeCoords?.latitude,
        placeLongitude: placeCoords?.longitude,
        placeKakaoId: placeCoords?.kakaoId || undefined,
        interestLimit: positiveInt(form.interestLimit) ?? undefined,
        genderRatio: form.genderRatio.trim() || undefined,
        images,
        coverImage: images[0],
        inclusions: inclusions
          .map((label) => label.trim())
          .filter(Boolean)
          .map((label) => ({ label })),
        faqs: faqs.map(({ question, answer }) => ({
          question: question.trim(),
          answer: answer.trim(),
        })),
      };
      if (mode === "create") return createParty(businessId, payload, scope);
      if (!party) throw new Error("파티를 찾을 수 없습니다");
      return updateParty(party.id, payload, scope);
    },
    successMessage: mode === "create" ? "파티가 생성되었습니다" : "저장되었습니다",
    errorMessage: "저장에 실패했습니다",
    onSuccess: (saved) => {
      router.replace(successHref(saved.id));
    },
  });

  async function searchPlaces() {
    const q = placeQuery.trim();
    if (q.length < 2) {
      toast.error("검색어를 2자 이상 입력해 주세요");
      return;
    }
    setPlaceSearching(true);
    try {
      const { adminFetchJson } = await import("@/auth/api/admin-http");
      const { AdminApi } = await import("@/auth/model/admin-routes");
      const data = await adminFetchJson<
        Array<{
          id: string;
          placeName: string;
          address: string;
          locationLabel: string;
          latitude: number;
          longitude: number;
        }>
      >(`${AdminApi.placesKakaoSearch()}?query=${encodeURIComponent(q)}&size=12`);
      setPlaceResults(data);
      if (data.length === 0) toast.message("검색 결과가 없어요");
    } catch {
      toast.error("장소 검색에 실패했어요. 로그인·카카오 REST 키를 확인해 주세요");
      setPlaceResults([]);
    } finally {
      setPlaceSearching(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || save.isPending) return;
    const minAge = positiveInt(form.minAge);
    const maxAge = positiveInt(form.maxAge);
    if (minAge !== null && maxAge !== null && minAge > maxAge) {
      toast.error("최소 나이는 최대 나이보다 작아야 합니다.");
      return;
    }
    if (faqs.some(({ question, answer }) => question.trim().length === 0 || answer.trim().length === 0)) {
      toast.error("FAQ의 질문과 답변을 모두 입력해 주세요");
      return;
    }
    save.mutate();
  }

  return (
    <div className="font-pretendard min-h-dvh bg-white pb-10">
      <header className="flex h-14 items-center gap-3 px-4">
        <Link
          href={cancelHref}
          className="grid size-8 place-items-center rounded-lg hover:bg-[#f5f5f5]"
          aria-label="뒤로"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="text-[18px] font-bold leading-[1.5]">
          {mode === "create" ? "파티 만들기" : "파티 수정"}
        </h1>
      </header>

      <form onSubmit={submit} className="space-y-6 px-4 py-2">
        <Fieldset label="파티 유형">
          {categories.isLoading && (
            <p className="h-10 rounded-xl bg-[#f5f5f5] px-3 py-2.5 text-[13px] text-[#8f8f8f]">
              파티 유형을 불러오는 중…
            </p>
          )}
          {categories.error && (
            <div className="flex min-h-10 items-center justify-between gap-2 rounded-xl bg-red-50 px-3 py-2 text-[13px] text-red-600">
              <span>파티 유형을 불러오지 못했습니다.</span>
              <button type="button" onClick={() => void categories.refetch()}>
                다시 시도
              </button>
            </div>
          )}
          {categories.data && categories.data.length === 0 && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-[13px] text-red-600">
              활성 파티 유형이 없습니다. 관리자에게 문의해주세요.
            </p>
          )}
          <div className="grid grid-cols-4 gap-2">
            {categories.data?.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setSelectedCategoryId(category.id)}
                className={cn(
                  "h-10 rounded-xl border text-[14px] transition-colors",
                  categoryId === category.id
                    ? "border-[#9c6cf2] bg-[#f0e9fc] text-[#7144c2]"
                    : "border-[#dedede] bg-white text-[#686868]",
                )}
              >
                {category.name}
              </button>
            ))}
          </div>
        </Fieldset>

        <Field label="파티 이름">
          <input
            value={form.title}
            onChange={(event) => set("title", event.target.value)}
            placeholder="파티 이름을 입력해주세요."
            maxLength={200}
            required
            className="mobile-input h-[46px]"
          />
        </Field>

        <Field label="설명">
          <textarea
            value={form.description}
            onChange={(event) => set("description", event.target.value)}
            placeholder="파티 설명을 입력해주세요."
            maxLength={10000}
            required
            rows={5}
            className="mobile-input min-h-[150px] resize-y py-3"
          />
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label="시작">
            <input
              type="datetime-local"
              value={form.startsAt}
              onChange={(event) => set("startsAt", event.target.value)}
              required
              className="mobile-input h-[46px] text-[13px]"
            />
          </Field>
          <Field label="종료">
            <input
              type="datetime-local"
              value={form.endsAt}
              onChange={(event) => set("endsAt", event.target.value)}
              required
              className="mobile-input h-[46px] text-[13px]"
            />
          </Field>
        </div>

        <Field label="신청 마감">
          <input
            type="datetime-local"
            value={form.applicationDeadline}
            onChange={(event) => set("applicationDeadline", event.target.value)}
            required
            className="mobile-input h-[46px] text-[13px]"
          />
        </Field>

        <Fieldset label="장소 검색 (카카오맵)">
          <div className="flex gap-2">
            <input
              value={placeQuery}
              onChange={(event) => setPlaceQuery(event.target.value)}
              placeholder="예: 강남역 카페"
              className="mobile-input h-[46px]"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void searchPlaces();
                }
              }}
            />
            <button
              type="button"
              disabled={placeSearching}
              onClick={() => void searchPlaces()}
              className="h-[46px] shrink-0 rounded-xl border border-[#dedede] px-3 text-[13px]"
            >
              {placeSearching ? "검색 중…" : "검색"}
            </button>
          </div>
          {placeResults.length > 0 && (
            <ul className="max-h-48 overflow-auto rounded-xl border border-[#dedede] bg-white text-sm">
              {placeResults.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left hover:bg-[#f5f5f5]"
                    onClick={() => {
                      set("location", item.locationLabel);
                      set("placeName", item.placeName);
                      set("address", item.address);
                      setPlaceCoords({
                        latitude: item.latitude,
                        longitude: item.longitude,
                        kakaoId: item.id,
                      });
                      setPlaceResults([]);
                      setPlaceQuery(item.placeName);
                      toast.success("장소가 선택되었습니다");
                    }}
                  >
                    <div className="font-medium">{item.placeName}</div>
                    <div className="text-[12px] text-[#8f8f8f]">{item.address}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Fieldset>

        <Field label="공개 위치 (목록)">
          <input
            value={form.location}
            onChange={(event) => set("location", event.target.value)}
            placeholder="예: 서울 강남구"
            maxLength={500}
            required
            className="mobile-input h-[46px]"
          />
        </Field>
        <Field label="장소명 (확정 후 공개)">
          <input
            value={form.placeName}
            onChange={(event) => set("placeName", event.target.value)}
            className="mobile-input h-[46px]"
          />
        </Field>
        <Field label="주소 (확정 후 공개)">
          <input
            value={form.address}
            onChange={(event) => set("address", event.target.value)}
            className="mobile-input h-[46px]"
          />
        </Field>
        {placeCoords && (
          <p className="text-[12px] text-[#8f8f8f]">
            좌표: {placeCoords.latitude.toFixed(5)}, {placeCoords.longitude.toFixed(5)}
          </p>
        )}

        <Fieldset label="모집인원">
          <div className="grid grid-cols-3 gap-2">
            <NumberInput label="전체" value={form.maxCapacity} onChange={(value) => set("maxCapacity", value)} />
            <NumberInput label="남자 (선택)" value={form.maxMale} onChange={(value) => set("maxMale", value)} />
            <NumberInput label="여자 (선택)" value={form.maxFemale} onChange={(value) => set("maxFemale", value)} />
          </div>
        </Fieldset>

        <Fieldset label="나이 제한">
          <div className="grid grid-cols-2 gap-2">
            <NumberInput label="최소 나이" value={form.minAge} onChange={(value) => set("minAge", value)} suffix="세 이상" />
            <NumberInput label="최대 나이" value={form.maxAge} onChange={(value) => set("maxAge", value)} suffix="세 이하" />
          </div>
        </Fieldset>

        <Fieldset label="참가비 (원)">
          <div className="grid grid-cols-2 gap-2">
            <NumberInput label="남자 참가비" value={form.priceMale} onChange={(value) => set("priceMale", value)} suffix="원" />
            <NumberInput label="여자 참가비" value={form.priceFemale} onChange={(value) => set("priceFemale", value)} suffix="원" />
          </div>
        </Fieldset>

        <div className="grid grid-cols-2 gap-2">
          <NumberInput
            label="호감 선택 상한"
            value={form.interestLimit}
            onChange={(value) => set("interestLimit", value)}
            suffix="명"
          />
          <Field label="성비 안내">
            <input
              value={form.genderRatio}
              onChange={(event) => set("genderRatio", event.target.value)}
              placeholder="예: 1:1"
              className="mobile-input h-[46px]"
            />
          </Field>
        </div>

        <Fieldset label="참여방식">
          <div className="grid grid-cols-2 gap-2">
            {(["APPROVAL", "INSTANT"] as const).map((modeValue) => (
              <button
                key={modeValue}
                type="button"
                onClick={() => set("admissionMode", modeValue)}
                className={cn(
                  "h-[46px] rounded-xl border text-[14px]",
                  form.admissionMode === modeValue
                    ? "border-[#9c6cf2] bg-[#f0e9fc] text-[#7144c2]"
                    : "border-[#dedede] text-[#686868]",
                )}
              >
                {modeValue === "APPROVAL" ? "승인제" : "신청 즉시 참여"}
              </button>
            ))}
          </div>
        </Fieldset>

        <Fieldset label="커버 이미지">
          <PartyImageUploader
            mode="multiple"
            maxFiles={10}
            value={images}
            onChange={setImages}
            uploadUrl="/businesses/me/parties/media-upload-url"
          />
        </Fieldset>

        <Fieldset label="포함 사항">
          <button
            type="button"
            disabled={inclusions.length >= 20}
            onClick={() => setInclusions((items) => [...items, ""])}
            className="inline-flex items-center gap-1 text-[13px] text-[#7144c2]"
          >
            <Plus className="size-4" />
            추가
          </button>
          {inclusions.map((label, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
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
                className="mobile-input h-[46px]"
              />
              <button
                type="button"
                aria-label={`포함 사항 ${index + 1} 삭제`}
                onClick={() =>
                  setInclusions((items) => items.filter((_, itemIndex) => itemIndex !== index))
                }
              >
                <Trash2 className="size-4 text-red-500" />
              </button>
            </div>
          ))}
        </Fieldset>

        <Fieldset label="자주 묻는 질문">
          <button
            type="button"
            disabled={faqs.length >= 20}
            onClick={() => setFaqs((items) => [...items, { question: "", answer: "" }])}
            className="inline-flex items-center gap-1 text-[13px] text-[#7144c2]"
          >
            <Plus className="size-4" />
            질문 추가
          </button>
          {faqs.map((faq, index) => (
            <div key={index} className="space-y-2 rounded-xl border border-[#dedede] p-3">
              <div className="flex items-start gap-2">
                <div className="flex-1 space-y-2">
                  <input
                    aria-label={`FAQ ${index + 1} 질문`}
                    maxLength={200}
                    placeholder="질문"
                    value={faq.question}
                    onChange={(event) =>
                      setFaqs((items) =>
                        items.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, question: event.target.value } : item,
                        ),
                      )
                    }
                    className="mobile-input h-[46px]"
                  />
                  <textarea
                    aria-label={`FAQ ${index + 1} 답변`}
                    maxLength={2000}
                    rows={3}
                    placeholder="답변"
                    value={faq.answer}
                    onChange={(event) =>
                      setFaqs((items) =>
                        items.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, answer: event.target.value } : item,
                        ),
                      )
                    }
                    className="mobile-input min-h-[90px] resize-y py-3"
                  />
                </div>
                <button
                  type="button"
                  aria-label={`FAQ ${index + 1} 삭제`}
                  onClick={() =>
                    setFaqs((items) => items.filter((_, itemIndex) => itemIndex !== index))
                  }
                >
                  <Trash2 className="size-4 text-red-500" />
                </button>
              </div>
            </div>
          ))}
        </Fieldset>

        <button
          type="submit"
          disabled={!valid || save.isPending}
          className="h-12 w-full rounded-xl bg-[#9c6cf2] text-[14px] text-white transition-colors disabled:bg-[#c8c8c8]"
        >
          {save.isPending ? "저장 중…" : mode === "create" ? "완료" : "저장"}
        </button>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="block text-[12px] leading-[1.5] text-[#8f8f8f]">{label}</span>
      {children}
    </label>
  );
}

function Fieldset({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-[12px] leading-[1.5] text-[#8f8f8f]">{label}</legend>
      {children}
    </fieldset>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  suffix = "명",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  suffix?: string;
}) {
  return (
    <label className="space-y-1">
      <span className="block text-[12px] text-[#8f8f8f]">{label}</span>
      <div className="relative">
        <input
          type="number"
          min={0}
          inputMode="numeric"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="0"
          className="mobile-input h-[46px] pr-10"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-[#8f8f8f]">
          {suffix}
        </span>
      </div>
    </label>
  );
}
