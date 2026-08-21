"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" role="dialog" aria-modal="true" aria-labelledby="qr-checkin-title">
      <div className="flex w-full max-w-[430px] flex-col gap-4 rounded-t-[24px] bg-white px-4 pb-[max(24px,env(safe-area-inset-bottom))] pt-6">
        <h2 id="qr-checkin-title" className="text-center text-[18px] font-bold">QR 체크인</h2>
        <video ref={videoRef} className="h-48 w-full rounded-xl bg-black object-cover" muted playsInline />
        {cameraError ? <p className="text-center text-[13px] text-[#686868]">{cameraError}</p> : null}
        {error ? <p className="text-center text-[13px] text-red-600">{error}</p> : null}
        <div className="grid gap-1.5">
          <Label htmlFor="qr-token">QR 토큰</Label>
          <Input
            id="qr-token"
            value={manual}
            onChange={(event) => setManual(event.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Button type="button" variant="outline" className="h-12" onClick={onClose}>닫기</Button>
          <Button
            type="button"
            className="h-12 bg-[#9c6cf2] text-white hover:bg-[#9c6cf2]/90"
            disabled={pending || manual.trim().length === 0}
            onClick={() => onToken(manual.trim())}
          >
            {pending ? "처리 중…" : "토큰으로 체크인"}
          </Button>
        </div>
      </div>
    </div>
  );
}
