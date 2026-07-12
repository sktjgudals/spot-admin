"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const MAX_EDGE = 1920;
const QUALITY = 0.8;

type SingleProps = {
  mode: "single";
  value: string;
  onChange: (url: string) => void;
  uploadUrl: string;
  maxFiles?: never;
};

type MultipleProps = {
  mode: "multiple";
  value: string[];
  onChange: (urls: string[]) => void;
  uploadUrl: string;
  maxFiles?: number;
};

type Props = SingleProps | MultipleProps;

async function optimizeImage(file: File): Promise<{ blob: Blob; contentType: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("CANVAS_UNSUPPORTED");
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const tryTypes = ["image/webp", "image/jpeg"] as const;
  for (const type of tryTypes) {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, type, QUALITY),
    );
    if (blob && blob.size > 0) {
      return { blob, contentType: type };
    }
  }

  // fallback: 원본 사용
  return { blob: file, contentType: file.type || "image/jpeg" };
}

async function uploadOptimized(
  file: File,
  uploadUrl: string,
): Promise<string> {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error("jpeg/png/webp만 업로드할 수 있습니다");
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error("10MB 이하 이미지만 업로드할 수 있습니다");
  }

  const { blob, contentType } = await optimizeImage(file);

  const presignRes = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentType, sizeBytes: blob.size }),
  });
  if (!presignRes.ok) {
    const err = await presignRes.json().catch(() => ({}));
    throw new Error(err.message ?? "업로드 URL 발급에 실패했습니다");
  }
  const { uploadUrl: putUrl, publicUrl } = (await presignRes.json()) as {
    uploadUrl: string;
    publicUrl: string;
  };
  if (!putUrl || !publicUrl) {
    throw new Error("업로드 URL 응답이 올바르지 않습니다");
  }

  const putRes = await fetch(putUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
  });
  if (!putRes.ok) {
    throw new Error("스토리지 업로드에 실패했습니다");
  }

  return publicUrl;
}

export function PartyImageUploader(props: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  const urls =
    props.mode === "single"
      ? props.value
        ? [props.value]
        : []
      : props.value;
  const maxFiles = props.mode === "single" ? 1 : (props.maxFiles ?? 10);
  const canAdd = urls.length < maxFiles;

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;

      const slots = maxFiles - urls.length;
      if (slots <= 0) {
        toast.error(`이미지는 최대 ${maxFiles}장까지 올릴 수 있습니다`);
        return;
      }
      const toUpload = list.slice(0, slots);

      setUploading(true);
      try {
        const uploaded: string[] = [];
        for (const file of toUpload) {
          try {
            uploaded.push(await uploadOptimized(file, props.uploadUrl));
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "업로드에 실패했습니다");
          }
        }
        if (uploaded.length === 0) return;

        if (props.mode === "single") {
          props.onChange(uploaded[0]);
        } else {
          props.onChange([...props.value, ...uploaded].slice(0, maxFiles));
        }
      } finally {
        setUploading(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [maxFiles, props, urls.length],
  );

  const removeAt = (index: number) => {
    if (props.mode === "single") {
      props.onChange("");
    } else {
      props.onChange(props.value.filter((_, i) => i !== index));
    }
  };

  return (
    <div className="space-y-2">
      {urls.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {urls.map((url, i) => (
            <div
              key={`${url}-${i}`}
              className="relative h-24 w-24 overflow-hidden rounded-md border bg-muted"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white"
                onClick={() => removeAt(i)}
                aria-label="이미지 제거"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {canAdd && (
        <div
          role="button"
          tabIndex={0}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed px-4 py-8 text-center transition-colors",
            dragging ? "border-primary bg-primary/5" : "border-muted-foreground/30",
            uploading && "pointer-events-none opacity-60",
          )}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
          }}
          onDragEnter={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void handleFiles(e.dataTransfer.files);
          }}
        >
          {uploading ? (
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          ) : (
            <ImagePlus className="h-6 w-6 text-muted-foreground" />
          )}
          <div className="space-y-0.5">
            <p className="text-sm font-medium">
              {uploading
                ? "업로드 중..."
                : "이미지를 드래그하거나 클릭해서 업로드"}
            </p>
            <p className="text-xs text-muted-foreground">
              jpeg/png/webp · 최대 10MB · 자동 리사이즈(1920px)
              {props.mode === "multiple" ? ` · 최대 ${maxFiles}장` : ""}
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple={props.mode === "multiple"}
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void handleFiles(e.target.files);
            }}
          />
        </div>
      )}
    </div>
  );
}
