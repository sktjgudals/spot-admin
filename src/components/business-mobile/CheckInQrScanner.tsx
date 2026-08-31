"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>;
};

type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

function barcodeDetector(): BarcodeDetectorCtor | undefined {
  return (window as Window & { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
}

export function CheckInQrScanner({
  open,
  pending,
  error,
  onClose,
  onToken,
}: {
  open: boolean;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onToken: (token: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onTokenRef = useRef(onToken);
  const [manual, setManual] = useState("");
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (!open) return;
    let stopped = false;
    let stream: MediaStream | null = null;
    let frame = 0;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("이 브라우저는 카메라 스캔을 지원하지 않습니다. 토큰을 직접 입력해 주세요.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
        });
        if (stopped) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        const Detector = barcodeDetector();
        if (!Detector) {
          setCameraError("QR 자동 인식이 없어 토큰을 직접 입력해 주세요.");
          return;
        }
        const detector = new Detector({ formats: ["qr_code"] });
        const tick = async () => {
          if (stopped || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const token = codes.find((code) => code.rawValue.trim())?.rawValue.trim();
            if (token) {
              onTokenRef.current(token);
              return;
            }
          } catch {
            // Keep scanning while the camera is live.
          }
          frame = window.requestAnimationFrame(() => {
            void tick();
          });
        };
        void tick();
      } catch {
        setCameraError("카메라 권한이 거부되었습니다. 토큰을 직접 입력해 주세요.");
      }
    }

    void start();
    return () => {
      stopped = true;
      window.cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [open]);

  function handleClose() {
    setCameraError(null);
    setManual("");
    onClose();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleClose();
      }}
    >
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>QR 체크인</DialogTitle>
          <DialogDescription>
            카메라를 비추거나 토큰을 직접 입력해 입장 처리할 수 있습니다.
          </DialogDescription>
        </DialogHeader>
        <video
          ref={videoRef}
          className="h-48 w-full rounded-xl bg-black object-cover"
          aria-label="QR 카메라 미리보기"
          muted
          playsInline
        />
        {cameraError ? (
          <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
            {cameraError}
          </p>
        ) : null}
        {error ? (
          <p id="qr-check-in-error" className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <div className="grid gap-1.5">
          <Label htmlFor="qr-token">QR 토큰</Label>
          <Input
            id="qr-token"
            className="min-h-11"
            value={manual}
            onChange={(event) => setManual(event.target.value)}
            autoComplete="off"
            placeholder="QR 토큰 붙여넣기"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "qr-check-in-error" : undefined}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" className="min-h-11" onClick={handleClose}>
            닫기
          </Button>
          <Button
            type="button"
            className="min-h-11"
            disabled={pending || manual.trim().length === 0}
            onClick={() => onToken(manual.trim())}
          >
            {pending ? "처리 중…" : "토큰으로 체크인"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
