import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import {
  X,
  RefreshCw,
  Volume2,
  VolumeX,
  Flashlight,
  FlashlightOff,
  AlertCircle,
  Barcode,
  Check,
  ZoomIn,
  Image as ImageIcon,
  ScanLine,
  Smartphone,
  Layers,
  Focus,
} from 'lucide-react';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (scannedText: string) => void;
  title?: string;
  placeholder?: string;
}

type ScanMode = 'auto' | 'imei';

const DETECTOR_FORMATS = [
  'code_128',
  'code_39',
  'code_93',
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'qr_code',
  'data_matrix',
  'itf',
  'codabar',
];

function extractCandidateByMode(raw: string, mode: ScanMode): string | null {
  const clean = (raw || '').trim();
  if (!clean) return null;
  if (mode === 'auto') return clean;

  // IMEI mode: extract 15-digit (or 14-16 digit) numeric IMEI; ignore URLs/promo QR codes
  const exact15 = clean.match(/\b\d{15}\b/);
  if (exact15) return exact15[0];
  const digitsOnly = clean.replace(/\D/g, '');
  if (digitsOnly.length >= 14 && digitsOnly.length <= 16) {
    return digitsOnly;
  }
  return null;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onScan,
  title = 'Smart Barcode & IMEI Scanner',
  placeholder = 'Type barcode or 15-digit IMEI...',
}) => {
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  const [scanMode, setScanMode] = useState<ScanMode>(() =>
    title.toLowerCase().includes('imei') ? 'imei' : 'auto'
  );
  const [continuousMode, setContinuousMode] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [hasHardwareZoom, setHasHardwareZoom] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [engineType, setEngineType] = useState<'turbo' | 'universal'>('turbo');
  const [manualCode, setManualCode] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [scannedHistory, setScannedHistory] = useState<string[]>([]);
  const [detectedFlash, setDetectedFlash] = useState<string | null>(null);
  const [lockingCode, setLockingCode] = useState<string | null>(null);
  const [focusTapPos, setFocusTapPos] = useState<{ x: number; y: number } | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const detectorRef = useRef<any>(null);
  const html5QrRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastScanRef = useRef<{ code: string; time: number }>({ code: '', time: 0 });
  const scanReadyAtRef = useRef<number>(0);
  const pendingLockRef = useRef<{
    code: string;
    count: number;
    firstTs: number;
    lastTs: number;
  }>({ code: '', count: 0, firstTs: 0, lastTs: 0 });
  const lockResetTimerRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);
  const scanModeRef = useRef<ScanMode>(scanMode);
  const continuousRef = useRef<boolean>(continuousMode);
  const zoomRef = useRef<number>(zoomLevel);

  scanModeRef.current = scanMode;
  continuousRef.current = continuousMode;
  zoomRef.current = zoomLevel;

  const fallbackRegionId = 'interactive-barcode-scanner-viewport';

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      setScanMode(title.toLowerCase().includes('imei') ? 'imei' : 'auto');
      setScannedHistory([]);
      setDetectedFlash(null);
      setLockingCode(null);
      lastScanRef.current = { code: '', time: 0 };
      pendingLockRef.current = { code: '', count: 0, firstTs: 0, lastTs: 0 };
    }
  }, [isOpen, title]);

  const playBeep = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1750, ctx.currentTime);
        gain.gain.setValueAtTime(0.28, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);
        osc.start();
        osc.stop(ctx.currentTime + 0.09);
      }
    } catch {
      // ignore audio restrictions
    }
    if (navigator.vibrate) {
      navigator.vibrate(65);
    }
  }, [soundEnabled]);

  const emitScanResult = useCallback(
    (rawText: string) => {
      const candidate = extractCandidateByMode(rawText, scanModeRef.current);
      if (!candidate) return;

      const now = Date.now();
      if (
        lastScanRef.current.code === candidate &&
        now - lastScanRef.current.time < 1300
      ) {
        return;
      }

      lastScanRef.current = { code: candidate, time: now };
      pendingLockRef.current = { code: '', count: 0, firstTs: 0, lastTs: 0 };
      if (lockResetTimerRef.current !== null) {
        window.clearTimeout(lockResetTimerRef.current);
        lockResetTimerRef.current = null;
      }
      setLockingCode(null);

      playBeep();
      setDetectedFlash(candidate);
      setScannedHistory(prev => [candidate, ...prev.filter(c => c !== candidate)].slice(0, 6));
      onScan(candidate);

      if (!continuousRef.current) {
        setTimeout(() => {
          if (isMountedRef.current) onClose();
        }, 110);
      } else {
        setTimeout(() => {
          if (isMountedRef.current) setDetectedFlash(null);
        }, 850);
      }
    },
    [onScan, onClose, playBeep]
  );

  // Require steady positioning inside reticle (~220ms + 2 consistent reads) before locking live stream reads
  const handleLiveCameraDetection = useCallback(
    (rawText: string) => {
      const now = Date.now();
      if (now < scanReadyAtRef.current) return;

      const candidate = extractCandidateByMode(rawText, scanModeRef.current);
      if (!candidate) return;

      if (
        lastScanRef.current.code === candidate &&
        now - lastScanRef.current.time < 1300
      ) {
        return;
      }

      const pending = pendingLockRef.current;
      const isSamePending = pending.code === candidate && now - pending.lastTs <= 650;

      if (!isSamePending) {
        pendingLockRef.current = {
          code: candidate,
          count: 1,
          firstTs: now,
          lastTs: now,
        };
        if (isMountedRef.current) setLockingCode(candidate);
      } else {
        pending.count += 1;
        pending.lastTs = now;
        const holdElapsed = now - pending.firstTs;
        if (pending.count >= 2 && holdElapsed >= 200) {
          emitScanResult(candidate);
          return;
        }
      }

      if (lockResetTimerRef.current !== null) {
        window.clearTimeout(lockResetTimerRef.current);
      }
      lockResetTimerRef.current = window.setTimeout(() => {
        pendingLockRef.current = { code: '', count: 0, firstTs: 0, lastTs: 0 };
        if (isMountedRef.current) setLockingCode(null);
      }, 650);
    },
    [emitScanResult]
  );

  const stopAllEngines = useCallback(async () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (lockResetTimerRef.current !== null) {
      window.clearTimeout(lockResetTimerRef.current);
      lockResetTimerRef.current = null;
    }
    pendingLockRef.current = { code: '', count: 0, firstTs: 0, lastTs: 0 };

    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach(track => track.stop());
      } catch {
        // ignore
      }
      streamRef.current = null;
    }

    if (videoRef.current) {
      try {
        videoRef.current.srcObject = null;
      } catch {
        // ignore
      }
    }

    if (html5QrRef.current) {
      try {
        if (html5QrRef.current.isScanning) {
          await html5QrRef.current.stop();
        }
        html5QrRef.current.clear();
      } catch {
        // ignore
      }
      html5QrRef.current = null;
    }

    if (isMountedRef.current) {
      setIsScanning(false);
      setLockingCode(null);
      setTorchOn(false);
      setTorchSupported(false);
      setHasHardwareZoom(false);
    }
  }, []);

  const refreshCameraList = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter(d => d.kind === 'videoinput');
      if (isMountedRef.current && videoInputs.length > 0) {
        setCameras(videoInputs);
      }
    } catch {
      // ignore
    }
  }, []);

  const startTurboHardwareEngine = async (detectorClass: any): Promise<boolean> => {
    try {
      const supported: string[] = await detectorClass.getSupportedFormats();
      const activeFormats = DETECTOR_FORMATS.filter(f => supported.includes(f));
      if (!activeFormats.includes('code_128') && !activeFormats.includes('ean_13')) {
        return false;
      }

      const detector = new detectorClass({ formats: activeFormats });
      detectorRef.current = detector;

      const videoConstraint: MediaTrackConstraints = selectedDeviceId
        ? {
            deviceId: { exact: selectedDeviceId },
            width: { ideal: 1920, min: 1280 },
            height: { ideal: 1080, min: 720 },
          }
        : {
            facingMode: { ideal: facingMode },
            width: { ideal: 1920, min: 1280 },
            height: { ideal: 1080, min: 720 },
          };

      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraint,
        audio: false,
      });

      if (!isMountedRef.current) {
        stream.getTracks().forEach(t => t.stop());
        return false;
      }

      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];

      if (track) {
        try {
          const caps = (track.getCapabilities ? track.getCapabilities() : {}) as any;
          if (caps?.torch) setTorchSupported(true);
          if (caps?.zoom) setHasHardwareZoom(true);
          if (Array.isArray(caps?.focusMode) && caps.focusMode.includes('continuous')) {
            await track.applyConstraints({
              advanced: [{ focusMode: 'continuous' } as any],
            });
          }
        } catch {
          // device ignores advanced constraints
        }
      }

      await refreshCameraList();

      const video = videoRef.current;
      if (!video) return false;
      video.srcObject = stream;
      await video.play();

      // Warmup delay so stray motion on modal open never triggers a false scan
      scanReadyAtRef.current = Date.now() + 450;
      setEngineType('turbo');
      setIsScanning(true);

      let lastFrameTs = 0;
      let busy = false;

      const scanFrame = async (ts: number) => {
        if (!isMountedRef.current || !streamRef.current) return;
        rafRef.current = requestAnimationFrame(scanFrame);

        if (busy || ts - lastFrameTs < 65) return;
        if (video.readyState < 2 || video.videoWidth === 0) return;

        lastFrameTs = ts;
        busy = true;
        try {
          const z = zoomRef.current;
          let targetSource: any = video;
          let srcW = video.videoWidth;
          let srcH = video.videoHeight;

          // Crop center reticle ROI (plus software zoom) into offscreen canvas so only aimed barcodes inside the frame are read
          if (!offscreenCanvasRef.current) {
            offscreenCanvasRef.current = document.createElement('canvas');
          }
          const canvas = offscreenCanvasRef.current;
          const effZoom = !hasHardwareZoom && z > 1.05 ? z : 1;
          const roiW = Math.floor((video.videoWidth * 0.86) / effZoom);
          const roiH = Math.floor((video.videoHeight * 0.56) / effZoom);
          const sx = Math.floor((video.videoWidth - roiW) / 2);
          const sy = Math.floor((video.videoHeight - roiH) / 2);
          canvas.width = Math.min(1280, Math.max(480, roiW));
          canvas.height = Math.min(720, Math.max(270, roiH));
          const ctx = canvas.getContext('2d', { willReadFrequently: false });
          if (ctx) {
            ctx.drawImage(video, sx, sy, roiW, roiH, 0, 0, canvas.width, canvas.height);
            targetSource = canvas;
            srcW = canvas.width;
            srcH = canvas.height;
          }

          const barcodes = await detectorRef.current.detect(targetSource);
          if (barcodes && barcodes.length > 0) {
            for (const b of barcodes) {
              const rawVal = b?.rawValue;
              if (!rawVal) continue;

              // Ensure barcode center sits comfortably inside active aiming zone
              if (b.boundingBox && srcW > 0 && srcH > 0) {
                const cx = (b.boundingBox.x + b.boundingBox.width / 2) / srcW;
                const cy = (b.boundingBox.y + b.boundingBox.height / 2) / srcH;
                if (cx < 0.06 || cx > 0.94 || cy < 0.08 || cy > 0.92) {
                  continue;
                }
              }

              const candidate = extractCandidateByMode(rawVal, scanModeRef.current);
              if (candidate) {
                handleLiveCameraDetection(rawVal);
                break;
              }
            }
          }
        } catch {
          // frame decode error ignored
        } finally {
          busy = false;
        }
      };

      rafRef.current = requestAnimationFrame(scanFrame);
      return true;
    } catch (err) {
      console.warn('Turbo native BarcodeDetector start failed, trying fallback:', err);
      return false;
    }
  };

  const startUniversalFallbackEngine = async () => {
    const formatsToSupport = [
      Html5QrcodeSupportedFormats.CODE_128,
      Html5QrcodeSupportedFormats.CODE_39,
      Html5QrcodeSupportedFormats.CODE_93,
      Html5QrcodeSupportedFormats.EAN_13,
      Html5QrcodeSupportedFormats.EAN_8,
      Html5QrcodeSupportedFormats.UPC_A,
      Html5QrcodeSupportedFormats.UPC_E,
      Html5QrcodeSupportedFormats.QR_CODE,
      Html5QrcodeSupportedFormats.DATA_MATRIX,
      Html5QrcodeSupportedFormats.ITF,
    ];

    try {
      const html5QrCode = new Html5Qrcode(fallbackRegionId, {
        formatsToSupport,
        verbose: false,
        useBarCodeDetectorIfSupported: true,
      } as any);
      html5QrRef.current = html5QrCode;

      const cameraConfig = selectedDeviceId ? selectedDeviceId : { facingMode };

      scanReadyAtRef.current = Date.now() + 500;

      await html5QrCode.start(
        cameraConfig,
        {
          fps: 18,
          qrbox: (vw: number, vh: number) => ({
            width: Math.min(Math.floor(vw * 0.78), 300),
            height: Math.min(Math.floor(vh * 0.36), 140),
          }),
          aspectRatio: 1.333334,
          videoConstraints: {
            ...(selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : { facingMode }),
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        } as any,
        (decodedText) => handleLiveCameraDetection(decodedText),
        () => {}
      );

      if (isMountedRef.current) {
        setEngineType('universal');
        setIsScanning(true);
        refreshCameraList();
      }
    } catch (err: any) {
      if (isMountedRef.current) {
        setErrorMsg(
          err?.name === 'NotAllowedError'
            ? 'Camera permission denied. Allow camera access in browser settings to scan barcodes.'
            : 'Unable to start camera scanner. Check camera access, scan a gallery photo, or enter code manually.'
        );
        setIsScanning(false);
      }
    }
  };

  const startScanner = async () => {
    await stopAllEngines();
    if (!isMountedRef.current) return;
    setErrorMsg(null);

    const BarcodeDetectorClass = (window as any).BarcodeDetector;
    if (BarcodeDetectorClass && typeof navigator.mediaDevices?.getUserMedia === 'function') {
      const turboOk = await startTurboHardwareEngine(BarcodeDetectorClass);
      if (turboOk) return;
    }

    await startUniversalFallbackEngine();
  };

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        startScanner();
      }, 100);
      return () => {
        clearTimeout(timer);
        stopAllEngines();
      };
    } else {
      stopAllEngines();
    }
  }, [isOpen, facingMode, selectedDeviceId]);

  useEffect(() => {
    const track = streamRef.current?.getVideoTracks()?.[0];
    if (!track || !hasHardwareZoom) return;
    try {
      const caps = (track.getCapabilities ? track.getCapabilities() : {}) as any;
      if (caps?.zoom) {
        const clamped = Math.min(caps.zoom.max || 3, Math.max(caps.zoom.min || 1, zoomLevel));
        track.applyConstraints({ advanced: [{ zoom: clamped } as any] }).catch(() => {});
      }
    } catch {
      // ignore
    }
  }, [zoomLevel, hasHardwareZoom]);

  const handleCycleCamera = () => {
    if (cameras.length > 1) {
      const curIdx = selectedDeviceId
        ? cameras.findIndex(c => c.deviceId === selectedDeviceId)
        : -1;
      const nextCam = cameras[(curIdx + 1) % cameras.length];
      setSelectedDeviceId(nextCam.deviceId);
    } else {
      setSelectedDeviceId(null);
      setFacingMode(prev => (prev === 'environment' ? 'user' : 'environment'));
    }
  };

  const toggleTorch = async () => {
    const next = !torchOn;
    if (streamRef.current) {
      const track = streamRef.current.getVideoTracks()[0];
      if (track) {
        try {
          await track.applyConstraints({ advanced: [{ torch: next } as any] });
          setTorchOn(next);
          return;
        } catch {
          // ignore
        }
      }
    }
    if (html5QrRef.current && isScanning) {
      try {
        await html5QrRef.current.applyVideoConstraints({
          advanced: [{ torch: next } as any],
        });
        setTorchOn(next);
      } catch {
        // unsupported
      }
    }
  };

  const handleViewportTapFocus = async (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setFocusTapPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setTimeout(() => {
      if (isMountedRef.current) setFocusTapPos(null);
    }, 650);

    const track = streamRef.current?.getVideoTracks()?.[0];
    if (track) {
      try {
        await track.applyConstraints({
          advanced: [{ focusMode: 'continuous' } as any],
        });
      } catch {
        // ignore
      }
    }
  };

  const handleFileImageScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const BarcodeDetectorClass = (window as any).BarcodeDetector;
      if (BarcodeDetectorClass && typeof createImageBitmap === 'function') {
        const detector = new BarcodeDetectorClass({ formats: DETECTOR_FORMATS });
        const bitmap = await createImageBitmap(file);
        const results = await detector.detect(bitmap);
        bitmap.close?.();
        if (results && results.length > 0) {
          const valid = results.find((r: any) =>
            extractCandidateByMode(r.rawValue || '', scanModeRef.current)
          );
          const pick = valid || results[0];
          if (pick?.rawValue) {
            emitScanResult(pick.rawValue);
            return;
          }
        }
      }

      const tempScanner = new Html5Qrcode('barcode-image-temp-reader', { verbose: false });
      const text = await tempScanner.scanFile(file, false);
      tempScanner.clear();
      if (text) {
        emitScanResult(text);
        return;
      }
    } catch {
      setErrorMsg('No readable barcode or IMEI found in that photo. Try a sharper close-up.');
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.trim()) {
      playBeep();
      onScan(manualCode.trim());
      setManualCode('');
      if (!continuousMode) onClose();
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleHardwareBack = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    window.addEventListener('pos-hardware-back', handleHardwareBack);
    return () => window.removeEventListener('pos-hardware-back', handleHardwareBack);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const activeCameraLabel = selectedDeviceId
    ? cameras.find(c => c.deviceId === selectedDeviceId)?.label || 'Camera'
    : facingMode === 'environment'
    ? 'Rear Cam'
    : 'Front Cam';

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[80] flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/55 overflow-y-auto"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-md w-full overflow-hidden shadow-2xl flex flex-col text-white my-auto animate-modal-pop max-h-[84dvh]"
      >
        <div id="barcode-image-temp-reader" className="hidden" />

        {/* Sleek Top Header */}
        <div className="px-3.5 py-2.5 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/30">
              <ScanLine className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-xs sm:text-sm text-white truncate leading-tight">
                {title}
              </h3>
              <p className="text-[10px] font-medium text-slate-400 truncate">
                {engineType === 'turbo' ? 'Optical Aim' : 'Universal Cam'} · {activeCameraLabel}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white w-8 h-8 rounded-lg hover:bg-slate-800 transition cursor-pointer flex items-center justify-center shrink-0"
            aria-label="Close scanner"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode & Multi-Scan Switch Strip */}
        <div className="px-3 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setScanMode('auto')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer flex items-center gap-1 ${
                scanMode === 'auto'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Barcode className="w-3 h-3" />
              <span>All Codes</span>
            </button>
            <button
              type="button"
              onClick={() => setScanMode('imei')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer flex items-center gap-1 ${
                scanMode === 'imei'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Ignore promo QR URLs & lock onto 15-digit IMEI barcodes only"
            >
              <Smartphone className="w-3 h-3" />
              <span>15-Digit IMEI</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setContinuousMode(prev => !prev)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer flex items-center gap-1 shrink-0 ${
              continuousMode
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
            title="Keep scanner open to scan multiple barcodes"
          >
            <Layers className="w-3 h-3" />
            <span>{continuousMode ? 'Multi: ON' : 'Single'}</span>
          </button>
        </div>

        {/* Optical Camera Viewport with Crisp Aiming Reticle */}
        <div
          onClick={handleViewportTapFocus}
          className="relative bg-black h-[225px] sm:h-[260px] flex items-center justify-center overflow-hidden cursor-crosshair select-none"
        >
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            style={
              !hasHardwareZoom && zoomLevel > 1
                ? { transform: `scale(${zoomLevel})`, transformOrigin: 'center center' }
                : undefined
            }
            className={`w-full h-full object-cover transition-transform duration-150 ${
              engineType === 'turbo' ? 'block' : 'hidden'
            }`}
          />

          <div
            id={fallbackRegionId}
            className={`w-full h-full overflow-hidden ${engineType === 'universal' ? 'block' : 'hidden'}`}
          />

          {/* Clean Viewfinder Mask + Corner Reticle */}
          {isScanning && !errorMsg && (
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-4">
              <div
                className={`w-[82%] max-w-[295px] h-[118px] rounded-xl relative transition-all duration-150 ${
                  detectedFlash
                    ? 'border-2 border-emerald-400 bg-emerald-500/20 shadow-[0_0_0_9999px_rgba(2,6,23,0.48)] scale-[1.01]'
                    : lockingCode
                    ? 'border-2 border-amber-400 bg-amber-400/10 shadow-[0_0_0_9999px_rgba(2,6,23,0.48)]'
                    : 'border border-white/35 bg-transparent shadow-[0_0_0_9999px_rgba(2,6,23,0.45)]'
                }`}
              >
                {/* Crisp horizontal laser aim guide */}
                <div
                  className={`absolute left-3 right-3 h-[2px] top-1/2 -translate-y-1/2 transition-colors ${
                    detectedFlash
                      ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                      : lockingCode
                      ? 'bg-amber-400 shadow-[0_0_8px_#fbbf24]'
                      : 'bg-gradient-to-r from-transparent via-cyan-400/90 to-transparent'
                  }`}
                />

                {/* L-Corner Optical Brackets */}
                <div className="absolute -top-0.5 -left-0.5 w-4 h-4 border-t-2 border-l-2 border-cyan-300 rounded-tl" />
                <div className="absolute -top-0.5 -right-0.5 w-4 h-4 border-t-2 border-r-2 border-cyan-300 rounded-tr" />
                <div className="absolute -bottom-0.5 -left-0.5 w-4 h-4 border-b-2 border-l-2 border-cyan-300 rounded-bl" />
                <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 border-b-2 border-r-2 border-cyan-300 rounded-br" />
              </div>

              {detectedFlash ? (
                <div className="mt-2.5 px-3 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-bold tabular-nums shadow-md flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" />
                  <span>Scanned: {detectedFlash}</span>
                </div>
              ) : lockingCode ? (
                <p className="mt-2.5 px-2.5 py-1 rounded-lg bg-amber-500/90 text-slate-950 text-[10px] font-extrabold tabular-nums flex items-center gap-1.5">
                  <Focus className="w-3 h-3" />
                  <span>Hold steady to confirm...</span>
                </p>
              ) : (
                <p className="mt-2.5 px-2.5 py-1 rounded-lg bg-slate-950/75 border border-white/10 text-[10px] text-slate-200 font-medium flex items-center gap-1.5">
                  <Focus className="w-3 h-3 text-cyan-400" />
                  <span>
                    {scanMode === 'imei'
                      ? 'Center 15-digit IMEI inside frame'
                      : 'Center barcode inside frame to scan'}
                  </span>
                </p>
              )}
            </div>
          )}

          {/* Tap-to-focus Ring */}
          {focusTapPos && (
            <div
              style={{ left: focusTapPos.x - 18, top: focusTapPos.y - 18 }}
              className="absolute w-9 h-9 rounded-full border-2 border-cyan-400 pointer-events-none animate-ping"
            />
          )}

          {/* Error Overlay */}
          {errorMsg && (
            <div className="absolute inset-0 bg-slate-950/95 p-5 flex flex-col items-center justify-center text-center space-y-3 z-10">
              <AlertCircle className="w-8 h-8 text-amber-400" />
              <p className="text-xs text-slate-300 leading-relaxed max-w-xs">{errorMsg}</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={startScanner}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition cursor-pointer inline-flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Retry Camera
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition cursor-pointer inline-flex items-center gap-1.5"
                >
                  <ImageIcon className="w-3.5 h-3.5" /> Photo
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Optical Controls: Zoom + Hardware Actions */}
        <div className="px-3 py-2 bg-slate-950 border-t border-slate-800 space-y-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1 shrink-0">
              <ZoomIn className="w-3.5 h-3.5 text-cyan-400" />
              <span>Zoom</span>
            </span>
            <div className="flex items-center gap-1 flex-1 justify-end">
              {[1, 1.5, 2, 3].map(z => (
                <button
                  key={z}
                  type="button"
                  onClick={() => setZoomLevel(z)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold tabular-nums transition cursor-pointer ${
                    zoomLevel === z
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                  }`}
                >
                  {z}x
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            <button
              type="button"
              onClick={handleCycleCamera}
              className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition cursor-pointer flex items-center justify-center gap-1 text-[11px] font-bold"
              title="Switch Camera / Lens"
            >
              <RefreshCw className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span className="truncate">{cameras.length > 2 ? 'Lens' : 'Flip'}</span>
            </button>

            <button
              type="button"
              onClick={toggleTorch}
              disabled={!torchSupported && engineType === 'turbo'}
              className={`px-2 py-1.5 rounded-xl transition cursor-pointer flex items-center justify-center gap-1 text-[11px] font-bold disabled:opacity-40 ${
                torchOn
                  ? 'bg-amber-500 text-slate-950 font-extrabold'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
              }`}
              title="Toggle Flashlight"
            >
              {torchOn ? <Flashlight className="w-3.5 h-3.5 shrink-0" /> : <FlashlightOff className="w-3.5 h-3.5 shrink-0" />}
              <span>Torch</span>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileImageScan}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition cursor-pointer flex items-center justify-center gap-1 text-[11px] font-bold"
              title="Scan from Gallery Photo"
            >
              <ImageIcon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Photo</span>
            </button>

            <button
              type="button"
              onClick={() => setSoundEnabled(prev => !prev)}
              className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition cursor-pointer flex items-center justify-center gap-1 text-[11px] font-bold"
              title={soundEnabled ? 'Mute Beep' : 'Enable Beep'}
            >
              {soundEnabled ? (
                <Volume2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              ) : (
                <VolumeX className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              )}
              <span>{soundEnabled ? 'Sound' : 'Muted'}</span>
            </button>
          </div>
        </div>

        {/* Continuous Mode Scanned Strip */}
        {continuousMode && scannedHistory.length > 0 && (
          <div className="px-3 py-2 bg-slate-900 border-t border-slate-800 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 overflow-x-auto min-w-0">
              <span className="text-[10px] font-bold text-slate-400 shrink-0">Scanned:</span>
              {scannedHistory.map((code, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold tabular-nums shrink-0"
                >
                  {code}
                </span>
              ))}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-extrabold shrink-0 cursor-pointer"
            >
              Done
            </button>
          </div>
        )}

        {/* Compact Manual Entry / USB Gun Input */}
        <form onSubmit={handleManualSubmit} className="p-3 border-t border-slate-800 bg-slate-900 space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Barcode className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={manualCode}
                onChange={e => setManualCode(e.target.value)}
                placeholder={placeholder || 'Type barcode or 15-digit IMEI...'}
                className="compact-mobile-input w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs tabular-nums font-bold text-white focus:outline-none focus:border-blue-500 h-9"
              />
            </div>
            <button
              type="submit"
              disabled={!manualCode.trim()}
              className="px-3.5 h-9 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold text-xs rounded-xl transition cursor-pointer flex items-center gap-1 shrink-0"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Use</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
