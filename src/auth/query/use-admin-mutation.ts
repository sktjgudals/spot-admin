"use client";

import { useMutation, type UseMutationOptions } from "@tanstack/react-query";
import { toast } from "sonner";
import { AdminAuthError } from "@/auth/model/admin-auth.errors";

type AdminMutationOptions<TData, TVariables> = {
  successMessage?: string | ((data: TData, variables: TVariables) => string);
  errorMessage?: string;
} & Omit<UseMutationOptions<TData, Error, TVariables>, "retry">;

export function useAdminMutation<TData, TVariables = void>(
  options: AdminMutationOptions<TData, TVariables>,
) {
  const { successMessage, errorMessage, onSuccess, onError, ...rest } = options;
  return useMutation({
    ...rest,
    retry: false,
    onSuccess: async (data, variables, onMutateResult, context) => {
      if (successMessage) {
        toast.success(
          typeof successMessage === "function"
            ? successMessage(data, variables)
            : successMessage,
        );
      }
      await onSuccess?.(data, variables, onMutateResult, context);
    },
    onError: (error, variables, onMutateResult, context) => {
      toast.error(
        error instanceof AdminAuthError
          ? error.message
          : (errorMessage ?? "처리하지 못했습니다."),
      );
      onError?.(error, variables, onMutateResult, context);
    },
  });
}
