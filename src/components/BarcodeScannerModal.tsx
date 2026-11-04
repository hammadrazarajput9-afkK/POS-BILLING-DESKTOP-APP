import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Camera, X, RefreshCw, Volume2, VolumeX, Flashlight, FlashlightOff, AlertCircle, Barcode, Check } from 'lucide-react';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (scannedText: string) => void;
  title?: string;
  placeholder?: string;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onScan,
  title = 'Live Camera Barcode & IMEI Scanner',
  placeholder = 'Scan product barcode or IMEI label...'
}) => {
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [torchOn, setTorchOn] = useState(false);
  const [lastScanned, setLastScanned] = useState<string | null>(null);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scanRegionId = 'interactive-barcode-scanner-viewport';

  const playBeep = () => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1400, ctx.currentTime);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
        osc.start();
        osc.stop(ctx.currentTime + 0.12);
      }
    } catch {
      // AudioContext not allowed or supported
    }

    if (navigator.vibrate) {
      navigator.vibrate(80);
    }
  };

  const handleScanSuccess = (decodedText: string) => {
    if (!decodedText) return;
    const cleanText = decodedText.trim();
    if (cleanText === lastScanned) return;

    setLastScanned(cleanText);
    playBeep();
    onScan(cleanText);
    onClose();
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
      } catch (err) {
        console.warn('Error stopping barcode scanner:', err);
      }
      scannerRef.current = null;
    }
    setIsScanning(false);
    setTorchOn(false);
  };

  const startScanner = async () => {
    await stopScanner();
    setErrorMsg(null);
    setLastScanned(null);

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
      const html5QrCode = new Html5Qrcode(scanRegionId, {
        formatsToSupport,
        verbose: false,
      });
      scannerRef.current = html5QrCode;

      const config = {
        fps: 20,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const width = Math.min(viewfinderWidth * 0.85, 320);
          const height = Math.min(viewfinderHeight * 0.65, 180);
          return { width, height };
        },
        aspectRatio: 1.333334,
      };

      await html5QrCode.start(
        { facingMode },
        config,
        (decodedText) => handleScanSuccess(decodedText),
        () => {
          // ignore individual frame non-matches to avoid spam
        }
      );

      setIsScanning(true);
    } catch (err: any) {
      console.warn('Scanner start failed:', err);
      setErrorMsg(
        err?.name === 'NotAllowedError'
          ? 'Camera permission denied. Please allow camera access in browser settings to scan barcodes.'
          : 'Unable to start camera scanner. Please check device connection or enter barcode manually below.'
      );
      setIsScanning(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        startScanner();
      }, 150);
      return () => {
        clearTimeout(timer);
        stopScanner();
      };
    } else {
      stopScanner();
    }
  }, [isOpen, facingMode]);

  const handleFlip = () => {
    setFacingMode(prev => (prev === 'environment' ? 'user' : 'environment'));
  };

  const toggleTorch = async () => {
    if (scannerRef.current && isScanning) {
      try {
        const next = !torchOn;
        await scannerRef.current.applyVideoConstraints({
          advanced: [{ torch: next } as any],
        });
        setTorchOn(next);
      } catch (err) {
        console.warn('Torch is not supported on this device/camera');
      }
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.trim()) {
      playBeep();
      onScan(manualCode.trim());
      setManualCode('');
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full overflow-hidden shadow-2xl flex flex-col text-white my-auto animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1.5 bg-blue-500/20 text-blue-400 rounded-xl">
              <Camera className="w-4 h-4" />
            </div>
            <span className="font-extrabold text-xs sm:text-sm text-slate-100 truncate">{title}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Live Camera Scanner Viewport */}
        <div className="relative bg-black min-h-[260px] sm:min-h-[300px] flex items-center justify-center overflow-hidden">
          <div id={scanRegionId} className="w-full h-full overflow-hidden" />

          {/* Overlay Targeting Frame with Laser Effect */}
          {isScanning && !errorMsg && (
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-6">
              <div className="w-[82%] max-w-[280px] h-[160px] border-2 border-emerald-400/80 rounded-2xl relative shadow-[0_0_20px_rgba(16,185,129,0.3)] bg-emerald-500/5">
                {/* Scanner Laser Beam Animation */}
                <div className="absolute left-1 right-1 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_8px_#34d399] animate-pulse top-1/2 -translate-y-1/2" />
                
                {/* Corner Marks */}
                <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-white rounded-tl" />
                <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-white rounded-tr" />
                <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-white rounded-bl" />
                <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-white rounded-br" />
              </div>
              <p className="text-[11px] font-mono text-emerald-400 font-bold bg-slate-950/70 px-3 py-1 rounded-full border border-emerald-500/30 mt-3">
                Align Barcode / IMEI Inside Frame
              </p>
            </div>
          )}

          {/* Error Message */}
          {errorMsg && (
            <div className="p-6 text-center space-y-3 max-w-xs z-10">
              <AlertCircle className="w-10 h-10 text-amber-400 mx-auto" />
              <p className="text-xs text-slate-300 leading-relaxed">{errorMsg}</p>
              <button
                type="button"
                onClick={startScanner}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition cursor-pointer inline-flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Retry Camera
              </button>
            </div>
          )}
        </div>

        {/* Toolbar Controls */}
        <div className="px-4 py-2.5 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleFlip}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition cursor-pointer flex items-center gap-1 min-h-[44px]"
              title="Switch Front/Back Camera"
            >
              <RefreshCw className="w-4 h-4" />
              <span className="text-[10px] font-bold">Flip</span>
            </button>

            <button
              type="button"
              onClick={toggleTorch}
              className={`p-2 rounded-xl transition cursor-pointer flex items-center gap-1 min-h-[44px] ${
                torchOn ? 'bg-amber-500 text-black font-extrabold' : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
              }`}
              title="Toggle Flashlight / Torch"
            >
              {torchOn ? <Flashlight className="w-4 h-4" /> : <FlashlightOff className="w-4 h-4" />}
              <span className="text-[10px] font-bold">Torch</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setSoundEnabled(prev => !prev)}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition cursor-pointer min-h-[44px]"
            title={soundEnabled ? 'Mute Scan Sound' : 'Enable Scan Sound'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
          </button>
        </div>

        {/* Manual Barcode / IMEI Input Fallback Form */}
        <form onSubmit={handleManualSubmit} className="p-4 border-t border-slate-800 bg-slate-900/95 space-y-2">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Manual Entry / Search Code
          </label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Barcode className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={manualCode}
                onChange={e => setManualCode(e.target.value)}
                placeholder="Type barcode or 15-digit IMEI..."
                className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs font-mono font-bold text-white focus:outline-none focus:border-blue-500 min-h-[44px]"
              />
            </div>
            <button
              type="submit"
              disabled={!manualCode.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-extrabold text-xs rounded-xl transition cursor-pointer min-h-[44px] flex items-center gap-1 shrink-0"
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
