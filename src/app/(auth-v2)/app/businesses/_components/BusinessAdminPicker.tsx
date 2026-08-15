"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, UserRoundCheck } from "lucide-react";
import { toast } from "sonner";
import {
  assignBusinessAdmin,
  businessQueryKeys,
  searchBusinessAdminCandidates,
  type BusinessAdminAssignment,
  type BusinessAdminCandidate,
} from "@/auth/api/admin-business.api";
import { AdminAuthError } from "@/auth/model/admin-auth.errors";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  businessId?: string;
  selectedUserId?: string | null;
  onSelect?: (candidate: BusinessAdminCandidate) => void;
  onAssigned?: (assignment: BusinessAdminAssignment) => void;
  disabled?: boolean;
};

export function BusinessAdminPicker({
  businessId,
  selectedUserId,
  onSelect,
  onAssigned,
  disabled = false,
}: Props) {
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const search = useQuery({
    queryKey: businessQueryKeys.operatorCandidates(submittedQuery),
    queryFn: () => searchBusinessAdminCandidates(submittedQuery),
    enabled: submittedQuery.length >= 2,
    staleTime: 30_000,
  });
  const assignment = useMutation({
    mutationFn: (userId: string) => {
      if (!businessId) throw new Error("업체가 먼저 생성되어야 합니다");
      return assignBusinessAdmin(businessId, userId);
    },
    onSuccess: async ({ assignment: assigned }) => {
      toast.success(`${assigned.nickname}님을 업체 관리자로 할당했습니다.`);
      onAssigned?.(assigned);
      await queryClient.invalidateQueries({ queryKey: businessQueryKeys.all });
    },
    onError: (error) => {
      toast.error(
        error instanceof AdminAuthError
          ? error.message
          : "업체 관리자 할당에 실패했습니다.",
      );
    },
  });

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = input.trim();
    if (normalized.length < 2) {
      toast.error("이름이나 이메일을 2자 이상 입력하세요.");
      return;
    }
    setSubmittedQuery(normalized);
  };

  return (
    <div className="space-y-3">
      <form onSubmit={submitSearch} className="flex gap-2">
        <Input
          aria-label="기존 사용자 검색"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="이름 또는 이메일 검색"
          autoComplete="off"
          disabled={disabled}
        />
        <Button
          type="submit"
          variant="outline"
          disabled={disabled || search.isFetching}
        >
          <Search className="size-4" aria-hidden="true" />
          {search.isFetching ? "검색 중…" : "검색"}
        </Button>
      </form>

      {search.isError && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-sm text-destructive">
            {(search.error as Error).message || "사용자를 검색하지 못했습니다."}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void search.refetch()}
          >
            다시 시도
          </Button>
        </div>
      )}

      {search.data && search.data.items.length === 0 && (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          일치하는 활성 사용자가 없습니다.
        </p>
      )}

      {search.data && search.data.items.length > 0 && (
        <div className="divide-y rounded-md border">
          {search.data.items.map((candidate) => {
            const assignedHere =
              businessId !== undefined &&
              candidate.assignedBusinessId === businessId;
            const assignedElsewhere =
              candidate.assignedBusinessId !== null && !assignedHere;
            const selected = selectedUserId === candidate.id;
            const pending =
              assignment.isPending && assignment.variables === candidate.id;
            return (
              <div
                key={candidate.id}
                className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{candidate.nickname}</p>
                    <Badge variant="outline">{candidate.role}</Badge>
                    {assignedHere && <Badge>현재 업체 관리자</Badge>}
                    {assignedElsewhere && (
                      <Badge variant="destructive">다른 업체 할당됨</Badge>
                    )}
                  </div>
                  <p className="truncate text-sm text-muted-foreground">
                    {candidate.email ?? "이메일 없음"}
                  </p>
                  {assignedElsewhere && (
                    <p className="mt-1 break-all text-xs text-muted-foreground">
                      업체 ID: {candidate.assignedBusinessId}
                    </p>
                  )}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={selected || assignedHere ? "secondary" : "outline"}
                  disabled={
                    disabled ||
                    assignedHere ||
                    assignedElsewhere ||
                    assignment.isPending
                  }
                  onClick={() => {
                    if (businessId) assignment.mutate(candidate.id);
                    else onSelect?.(candidate);
                  }}
                >
                  <UserRoundCheck className="size-4" aria-hidden="true" />
                  {pending
                    ? "할당 중…"
                    : assignedHere
                      ? "할당됨"
                      : selected
                        ? "선택됨"
                        : businessId
                          ? "이 업체에 할당"
                          : "선택"}
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {search.data && (
        <p className="text-xs text-muted-foreground">
          사용자 목록 기준 시각: {new Date(search.data.asOf).toLocaleString()}
        </p>
      )}
    </div>
  );
}
