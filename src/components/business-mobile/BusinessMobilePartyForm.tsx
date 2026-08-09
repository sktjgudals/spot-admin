"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import {
  createParty,
  listPartyCategories,
  partyQueryKeys,
} from "@/auth/api/admin-party.api";
import { cn } from "@/lib/utils";

type FormState = {
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  location: string;
  maxCapacity: string;
  maxMale: string;
  maxFemale: string;
  minAge: string;
  maxAge: string;
  priceMale: string;
  priceFemale: string;
  admissionMode: "APPROVAL" | "INSTANT";
};

const initial: FormState = {
  title: "",
  description: "",
  startsAt: "",
  endsAt: "",
  location: "",
  maxCapacity: "",
  maxMale: "",
  maxFemale: "",
  minAge: "",
  maxAge: "",
  priceMale: "",
  priceFemale: "",
  admissionMode: "APPROVAL",
};

function positiveInt(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function birthYearForAge(age: number): number {
  return new Date().getFullYear() - age;
}

export function BusinessMobilePartyForm({ businessId }: { businessId: string }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initial);
  const categories = useQuery({
    queryKey: partyQueryKeys.categories,
    queryFn: listPartyCategories,
    staleTime: 5 * 60_000,
  });
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const categoryId = selectedCategoryId || categories.data?.[0]?.id || "";

  const valid = useMemo(() => {
    const capacity = positiveInt(form.maxCapacity);
    return (
      form.title.trim().length > 0 &&
      form.description.trim().length > 0 &&
      form.startsAt.length > 0 &&
      form.endsAt.length > 0 &&
      form.location.trim().length > 0 &&
      categoryId.length > 0 &&
      capacity !== null &&
      capacity >= 2 &&
      new Date(form.endsAt) > new Date(form.startsAt)
    );
  }, [categoryId, form]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || submitting) return;
    const maxCapacity = positiveInt(form.maxCapacity);
    if (maxCapacity === null) return;
    const minAge = positiveInt(form.minAge);
    const maxAge = positiveInt(form.maxAge);
    if (minAge !== null && maxAge !== null && minAge > maxAge) {
      toast.error("최소 나이는 최대 나이보다 작아야 합니다.");
      return;
    }

    setSubmitting(true);
    try {
      const created = await createParty(businessId, {
        title: form.title.trim(),
        description: form.description.trim(),
        date: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
        location: form.location.trim(),
        maxCapacity,
        maxMale: positiveInt(form.maxMale),
        maxFemale: positiveInt(form.maxFemale),
        // API stores a birth-year range. Younger(max age) maps to the older
        // birth year and older(max age) maps to the lower birth year.
        minBirthYear: maxAge === null ? null : birthYearForAge(maxAge),
        maxBirthYear: minAge === null ? null : birthYearForAge(minAge),
        priceMale: positiveInt(form.priceMale) ?? 0,
        priceFemale: positiveInt(form.priceFemale) ?? 0,
        admissionMode: form.admissionMode,
        categoryId,
      });
      const categoryName = categories.data?.find(
        (category) => category.id === categoryId,
      )?.name;
      toast.success(`${categoryName ?? "새"} 파티가 생성되었습니다.`);
      router.replace(`/app/parties/${encodeURIComponent(created.id)}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "파티를 생성하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="font-pretendard min-h-dvh bg-white pb-6">
      <header className="flex h-14 items-center gap-3 px-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="grid size-8 place-items-center rounded-lg hover:bg-[#f5f5f5]"
          aria-label="뒤로"
        >
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="text-[18px] font-bold leading-[1.5]">파티 만들기</h1>
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
          <Field label="진행 날짜">
            <input
              type="datetime-local"
              value={form.startsAt}
              onChange={(event) => set("startsAt", event.target.value)}
              required
              className="mobile-input h-[46px] text-[13px]"
            />
          </Field>
          <Field label="종료 날짜">
            <input
              type="datetime-local"
              value={form.endsAt}
              onChange={(event) => set("endsAt", event.target.value)}
              required
              className="mobile-input h-[46px] text-[13px]"
            />
          </Field>
        </div>

        <Field label="진행 장소">
          <input
            value={form.location}
            onChange={(event) => set("location", event.target.value)}
            placeholder="파티 장소를 입력해주세요."
            maxLength={500}
            required
            className="mobile-input h-[46px]"
          />
        </Field>

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

        <Fieldset label="참여방식">
          <div className="grid grid-cols-2 gap-2">
            {(["APPROVAL", "INSTANT"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => set("admissionMode", mode)}
                className={cn(
                  "h-[46px] rounded-xl border text-[14px]",
                  form.admissionMode === mode
                    ? "border-[#9c6cf2] bg-[#f0e9fc] text-[#7144c2]"
                    : "border-[#dedede] text-[#686868]",
                )}
              >
                {mode === "APPROVAL" ? "승인제" : "신청 즉시 참여"}
              </button>
            ))}
          </div>
        </Fieldset>

        <button
          type="submit"
          disabled={!valid || submitting}
          className="h-12 w-full rounded-xl bg-[#9c6cf2] text-[14px] text-white transition-colors disabled:bg-[#c8c8c8]"
        >
          {submitting ? "만드는 중…" : "완료"}
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
