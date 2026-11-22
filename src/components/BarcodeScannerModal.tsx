import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import {
  Camera,
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
  Zap,
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
  title = 'Fast Barcode & IMEI Scanner',
  placeholder = 'Scan product barcode or IMEI label...',
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
  const [focusTapPos, setFocusTapPos] = useState<{ x: number; y: number } | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const detectorRef = useRef<any>(null);
  const html5QrRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastScanRef = useRef<{ code: string; time: number }>({ code: '', time: 0 });
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
      lastScanRef.current = { code: '', time: 0 };
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
      playBeep();
      setDetectedFlash(candidate);
      setScannedHistory(prev => [candidate, ...prev.filter(c => c !== candidate)].slice(0, 6));
      onScan(candidate);

      if (!continuousRef.current) {
        setTimeout(() => {
          if (isMountedRef.current) onClose();
        }, 90);
      } else {
        setTimeout(() => {
          if (isMountedRef.current) setDetectedFlash(null);
        }, 850);
      }
    },
    [onScan, onClose, playBeep]
  );

  const stopAllEngines = useCallback(async () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

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

      setEngineType('turbo');
      setIsScanning(true);

      let lastFrameTs = 0;
      let busy = false;

      const scanFrame = async (ts: number) => {
        if (!isMountedRef.current || !streamRef.current) return;
        rafRef.current = requestAnimationFrame(scanFrame);

        if (busy || ts - lastFrameTs < 40) return;
        if (video.readyState < 2 || video.videoWidth === 0) return;

        lastFrameTs = ts;
        busy = true;
        try {
          const z = zoomRef.current;
          let targetSource: any = video;

          // If software zoom > 1x and hardware zoom isn't active, crop center ROI into crisp offscreen canvas
          if (z > 1.05 && !hasHardwareZoom) {
            if (!offscreenCanvasRef.current) {
              offscreenCanvasRef.current = document.createElement('canvas');
            }
            const canvas = offscreenCanvasRef.current;
            const sw = Math.floor(video.videoWidth / z);
            const sh = Math.floor(video.videoHeight / z);
            const sx = Math.floor((video.videoWidth - sw) / 2);
            const sy = Math.floor((video.videoHeight - sh) / 2);
            canvas.width = Math.min(1280, Math.max(640, sw));
            canvas.height = Math.min(720, Math.max(360, sh));
            const ctx = canvas.getContext('2d', { willReadFrequently: false });
            if (ctx) {
              ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
              targetSource = canvas;
            }
          }

          const barcodes = await detectorRef.current.detect(targetSource);
          if (barcodes && barcodes.length > 0) {
            for (const b of barcodes) {
              const rawVal = b?.rawValue;
              if (rawVal) {
                const candidate = extractCandidateByMode(rawVal, scanModeRef.current);
                if (candidate) {
                  emitScanResult(rawVal);
                  break;
                }
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

      await html5QrCode.start(
        cameraConfig,
        {
          fps: 30,
          qrbox: (vw: number, vh: number) => ({
            width: Math.min(Math.floor(vw * 0.9), 380),
            height: Math.min(Math.floor(vh * 0.52), 180),
          }),
          aspectRatio: 1.333334,
          videoConstraints: {
            ...(selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : { facingMode }),
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        } as any,
        (decodedText) => emitScanResult(decodedText),
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

  // Apply hardware zoom when zoomLevel changes
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

      // Fallback using Html5Qrcode.scanFile
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

  if (!isOpen) return null;

  const activeCameraLabel = selectedDeviceId
    ? cameras.find(c => c.deviceId === selectedDeviceId)?.label || 'Camera'
    : facingMode === 'environment'
    ? 'Back Cam'
    : 'Front Cam';

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-2 sm:p-4 bg-slate-950/90 backdrop-blur-sm animate-in fade-in overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl sm:rounded-3xl max-w-md w-full overflow-hidden shadow-2xl flex flex-col text-white my-auto animate-in zoom-in-95 duration-150">
        {/* Hidden div for image file fallback decoding */}
        <div id="barcode-image-temp-reader" className="hidden" />

        {/* Header */}
        <div className="px-3.5 py-2.5 border-b border-slate-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30">
              <Zap className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="font-extrabold text-xs sm:text-sm text-slate-100 truncate block leading-tight">
                {title}
              </span>
              <span className="text-[10px] font-semibold text-emerald-400 flex items-center gap-1">
                <span>{engineType === 'turbo' ? 'Turbo Hardware Engine' : 'Universal HD Engine'}</span>
                <span className="text-slate-500">·</span>
                <span className="text-slate-400 truncate max-w-[120px]">{activeCameraLabel}</span>
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white w-9 h-9 rounded-xl hover:bg-slate-800 transition cursor-pointer flex items-center justify-center shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scan Mode Bar: Auto vs IMEI Lock + Multi-Scan Toggle */}
        <div className="px-3 py-2 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setScanMode('auto')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer flex items-center gap-1 ${
                scanMode === 'auto'
                  ? 'bg-blue-600 text-white shadow-xs'
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
                  ? 'bg-emerald-600 text-white shadow-xs'
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
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
            title="Keep scanner open to scan multiple devices back-to-back"
          >
            <Layers className="w-3 h-3" />
            <span>{continuousMode ? 'Multi: ON' : 'Single'}</span>
          </button>
        </div>

        {/* Live Camera Scanner Viewport */}
        <div
          onClick={handleViewportTapFocus}
          className="relative bg-black h-[240px] sm:h-[280px] flex items-center justify-center overflow-hidden cursor-crosshair select-none"
        >
          {/* Engine 1: Native Hardware Video */}
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

          {/* Engine 2: Html5Qrcode Universal Fallback */}
          <div
            id={fallbackRegionId}
            className={`w-full h-full overflow-hidden ${engineType === 'universal' ? 'block' : 'hidden'}`}
          />

          {/* Targeting Reticle & Live Detection Flash */}
          {isScanning && !errorMsg && (
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-4">
              <div
                className={`w-[88%] max-w-[310px] h-[130px] rounded-2xl relative transition-all duration-150 border-2 ${
                  detectedFlash
                    ? 'border-emerald-400 bg-emerald-500/20 shadow-[0_0_28px_rgba(16,185,129,0.65)] scale-[1.02]'
                    : 'border-emerald-400/75 bg-emerald-500/5 shadow-[0_0_18px_rgba(16,185,129,0.2)]'
                }`}
              >
                <div className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_8px_#34d399] animate-pulse top-1/2 -translate-y-1/2" />
                <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-white rounded-tl" />
                <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-white rounded-tr" />
                <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-white rounded-bl" />
                <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-white rounded-br" />
              </div>

              {detectedFlash ? (
                <div className="mt-2.5 px-3 py-1 rounded-lg bg-emerald-600 text-white text-[11px] font-black tabular-nums shadow-lg flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" />
                  <span>Captured: {detectedFlash}</span>
                </div>
              ) : (
                <p className="text-[10px] tabular-nums text-emerald-300 font-bold bg-slate-950/75 px-2.5 py-1 rounded-lg border border-emerald-500/30 mt-2.5 flex items-center gap-1.5">
                  <Focus className="w-3 h-3" />
                  <span>
                    {scanMode === 'imei'
                      ? 'IMEI Lock Active — Tap frame to refocus'
                      : 'Align barcode / QR — Tap frame to refocus'}
                  </span>
                </p>
              )}
            </div>
          )}

          {/* Tap-to-focus Ring Feedback */}
          {focusTapPos && (
            <div
              style={{ left: focusTapPos.x - 20, top: focusTapPos.y - 20 }}
              className="absolute w-10 h-10 rounded-full border-2 border-amber-400 pointer-events-none animate-ping"
            />
          )}

          {/* Error Overlay */}
          {errorMsg && (
            <div className="absolute inset-0 bg-slate-950/90 p-5 flex flex-col items-center justify-center text-center space-y-3 z-10">
              <AlertCircle className="w-9 h-9 text-amber-400" />
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
                  <ImageIcon className="w-3.5 h-3.5" /> Scan Photo
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Zoom + Hardware Toolbar Controls */}
        <div className="px-3 py-2 bg-slate-950 border-t border-slate-800 space-y-2 text-xs">
          {/* Quick Zoom Presets for Tiny IMEI Labels */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1 shrink-0">
              <ZoomIn className="w-3.5 h-3.5 text-blue-400" />
              <span>Zoom</span>
            </span>
            <div className="flex items-center gap-1 flex-1 justify-end">
              {[1, 1.5, 2, 3].map(z => (
                <button
                  key={z}
                  type="button"
                  onClick={() => setZoomLevel(z)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold tabular-nums transition cursor-pointer ${
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

          {/* Camera / Torch / Photo / Sound Row */}
          <div className="flex items-center justify-between gap-1.5">
            <button
              type="button"
              onClick={handleCycleCamera}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition cursor-pointer flex items-center gap-1.5 text-[11px] font-bold"
              title="Switch Camera / Back Lens"
            >
              <RefreshCw className="w-3.5 h-3.5 text-blue-400" />
              <span>{cameras.length > 2 ? 'Switch Lens' : 'Flip'}</span>
            </button>

            <button
              type="button"
              onClick={toggleTorch}
              disabled={!torchSupported && engineType === 'turbo'}
              className={`px-2.5 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1 text-[11px] font-bold disabled:opacity-40 ${
                torchOn
                  ? 'bg-amber-500 text-black font-extrabold'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
              }`}
              title="Toggle Flashlight / Torch"
            >
              {torchOn ? <Flashlight className="w-3.5 h-3.5" /> : <FlashlightOff className="w-3.5 h-3.5" />}
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
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition cursor-pointer flex items-center gap-1 text-[11px] font-bold"
              title="Scan Barcode or IMEI from Gallery Photo"
            >
              <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />
              <span>Photo</span>
            </button>

            <button
              type="button"
              onClick={() => setSoundEnabled(prev => !prev)}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition cursor-pointer flex items-center gap-1 text-[11px] font-bold"
              title={soundEnabled ? 'Mute Beep' : 'Enable Beep'}
            >
              {soundEnabled ? (
                <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <VolumeX className="w-3.5 h-3.5 text-slate-400" />
              )}
            </button>
          </div>
        </div>

        {/* Continuous Mode Scanned History Strip */}
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

        {/* Manual Barcode / IMEI Input Fallback Form */}
        <form onSubmit={handleManualSubmit} className="p-3 border-t border-slate-800 bg-slate-900/95 space-y-1.5">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Manual Entry / USB Gun Input
          </label>
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
              className="px-3.5 h-9 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-extrabold text-xs rounded-xl transition cursor-pointer flex items-center gap-1 shrink-0"
            >
              <Check className="w-4 h-4" />
              <span>Use</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

