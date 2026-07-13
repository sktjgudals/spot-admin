"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PartyImageUploader } from "@/components/party-image-uploader";
import { fetchJson } from "@/lib/fetch-json";
import { queryKeys } from "@/lib/query-keys";

export type BusinessProfileInitial = {
  id: string;
  name: string;
  tagline: string | null;
  description: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  coverImages: string[];
  participationGuide: string | null;
  activePartyCount: number;
};

function coversFrom(profile: BusinessProfileInitial): string[] {
  if (profile.coverImages.length > 0) return profile.coverImages;
  if (profile.coverUrl) return [profile.coverUrl];
  return [];
}

export default function BusinessProfileForm({
  initial,
}: {
  initial: BusinessProfileInitial;
}) {
  const queryClient = useQueryClient();
  const { data: profile = initial } = useQuery({
    queryKey: queryKeys.businessProfile,
    queryFn: () =>
      fetchJson<BusinessProfileInitial>("/api/business/profile"),
    initialData: initial,
  });

  const [tagline, setTagline] = useState(profile.tagline ?? "");
  const [description, setDescription] = useState(profile.description ?? "");
  const [participationGuide, setParticipationGuide] = useState(
    profile.participationGuide ?? "",
  );
  const [logoUrl, setLogoUrl] = useState(profile.logoUrl ?? "");
  const [coverImages, setCoverImages] = useState<string[]>(coversFrom(profile));
  const [saving, setSaving] = useState(false);
  const [syncedProfile, setSyncedProfile] = useState(profile);

  if (profile !== syncedProfile) {
    setSyncedProfile(profile);
    setTagline(profile.tagline ?? "");
    setDescription(profile.description ?? "");
    setParticipationGuide(profile.participationGuide ?? "");
    setLogoUrl(profile.logoUrl ?? "");
    setCoverImages(coversFrom(profile));
  }

  async function onSave() {
    setSaving(true);
    try {
      await fetchJson("/api/business/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tagline,
          description,
          participationGuide,
          logoUrl: logoUrl || null,
          coverImages,
        }),
      });
      toast.success("업체 프로필이 저장되었습니다");
      await queryClient.invalidateQueries({
        queryKey: queryKeys.businessProfile,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  const previewCover = coverImages[0] ?? null;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-5">
        <div className="space-y-1.5">
          <Label>업체명</Label>
          <Input value={profile.name} disabled />
          <p className="text-xs text-muted-foreground">
            업체명은 슈퍼 어드민만 변경할 수 있습니다.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="tagline">한줄 소개</Label>
          <Input
            id="tagline"
            value={tagline}
            maxLength={80}
            placeholder="예: 강남 소셜 파티 · 매주 금요일"
            onChange={(e) => setTagline(e.target.value)}
          />
          <p className="text-xs text-muted-foreground text-right">{tagline.length}/80</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="description">상세 소개</Label>
          <Textarea
            id="description"
            value={description}
            maxLength={2000}
            rows={8}
            placeholder="앱 업체 프로필에 노출되는 소개글입니다."
            onChange={(e) => setDescription(e.target.value)}
          />
          <p className="text-xs text-muted-foreground text-right">
            {description.length}/2000
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="participationGuide">참여 요건</Label>
          <Textarea
            id="participationGuide"
            value={participationGuide}
            maxLength={2000}
            rows={6}
            placeholder="예: 참여 연령 25~35세, 캐주얼 복장, 지각 시 입장 제한"
            onChange={(e) => setParticipationGuide(e.target.value)}
          />
          <p className="text-xs text-muted-foreground text-right">
            {participationGuide.length}/2000
          </p>
        </div>

        <div className="space-y-1.5">
          <Label>로고</Label>
          <PartyImageUploader
            mode="single"
            value={logoUrl}
            onChange={setLogoUrl}
            uploadUrl="/api/business/parties/media-upload-url"
          />
        </div>

        <div className="space-y-1.5">
          <Label>커버 이미지 (최대 10장)</Label>
          <PartyImageUploader
            mode="multiple"
            value={coverImages}
            onChange={setCoverImages}
            uploadUrl="/api/business/parties/media-upload-url"
            maxFiles={10}
          />
        </div>

        <Button onClick={onSave} disabled={saving} className="w-full sm:w-auto">
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              저장 중…
            </>
          ) : (
            "저장"
          )}
        </Button>
      </div>

      <PhoneMockup
        name={profile.name}
        tagline={tagline}
        description={description}
        participationGuide={participationGuide}
        logoUrl={logoUrl || null}
        coverUrl={previewCover}
        coverCount={coverImages.length}
        activePartyCount={profile.activePartyCount}
      />
    </div>
  );
}

function PhoneMockup({
  name,
  tagline,
  description,
  participationGuide,
  logoUrl,
  coverUrl,
  coverCount,
  activePartyCount,
}: {
  name: string;
  tagline: string;
  description: string;
  participationGuide: string;
  logoUrl: string | null;
  coverUrl: string | null;
  coverCount: number;
  activePartyCount: number;
}) {
  return (
    <div className="lg:sticky lg:top-6">
      <p className="mb-2 text-xs font-medium text-muted-foreground">앱 미리보기</p>
      <div className="mx-auto w-[280px] rounded-[2rem] border-[10px] border-zinc-900 bg-zinc-900 shadow-xl">
        <div className="overflow-hidden rounded-[1.4rem] bg-white">
          <div className="relative h-36 bg-zinc-200">
            {coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coverUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-zinc-500">
                커버 이미지
              </div>
            )}
            {coverCount > 1 && (
              <span className="absolute bottom-2 right-2 rounded-md bg-zinc-800 px-2 py-0.5 text-[10px] text-white">
                1/{coverCount}
              </span>
            )}
            <div className="absolute -bottom-8 left-4">
              <div className="h-16 w-16 overflow-hidden rounded-2xl border-4 border-white bg-zinc-100 shadow">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-[10px] text-zinc-400">
                    로고
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="space-y-2 px-4 pb-5 pt-10">
            <h3 className="text-base font-bold text-zinc-900">{name || "업체명"}</h3>
            <p className="text-xs text-zinc-500">
              {tagline.trim() || "한줄 소개가 여기에 표시됩니다"}
            </p>
            <p className="text-[11px] text-zinc-400">활성 파티 {activePartyCount}개</p>
            {participationGuide.trim() && (
              <p className="line-clamp-3 whitespace-pre-wrap text-[11px] leading-relaxed text-zinc-600">
                {participationGuide.trim()}
              </p>
            )}
            <p className="line-clamp-6 whitespace-pre-wrap text-xs leading-relaxed text-zinc-700">
              {description.trim() || "상세 소개가 여기에 표시됩니다"}
            </p>
            <div className="pt-2">
              <div className="rounded-xl bg-violet-100 px-3 py-2 text-center text-xs font-medium text-violet-700">
                문의하기
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
