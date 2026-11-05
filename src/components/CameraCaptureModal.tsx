import React, { useState, useRef, useEffect } from 'react';
import { Camera, X, RefreshCw, Check, AlertCircle, Image as ImageIcon } from 'lucide-react';

interface CameraCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (base64DataUrl: string) => void;
  title?: string;
}

export const CameraCaptureModal: React.FC<CameraCaptureModalProps> = ({
  isOpen,
  onClose,
  onCapture,
  title = 'Take Photo with Camera',
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Stop camera tracks
  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  // Start camera stream
  const startCamera = async (mode: 'environment' | 'user') => {
    stopStream();
    setIsLoading(true);
    setErrorMsg(null);
    setCapturedPhoto(null);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API is not supported in this browser.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: mode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsLoading(false);
    } catch (err: any) {
      console.warn('Camera access failed:', err);
      // Fallback: try without facingMode constraints
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        streamRef.current = fallbackStream;
        if (videoRef.current) {
          videoRef.current.srcObject = fallbackStream;
          await videoRef.current.play();
        }
        setIsLoading(false);
      } catch (fallbackErr: any) {
        setErrorMsg(
          err.name === 'NotAllowedError'
            ? 'Camera permission denied. Please allow camera access in your browser settings.'
            : 'Unable to access camera. Please check device connections or upload a file instead.'
        );
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    if (isOpen) {
      startCamera(facingMode);
    } else {
      stopStream();
      setCapturedPhoto(null);
      setErrorMsg(null);
    }
    return () => {
      stopStream();
    };
  }, [isOpen, facingMode]);

  if (!isOpen) return null;

  // Capture current video frame to canvas
  const handleSnap = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current || document.createElement('canvas');

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw video frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    setCapturedPhoto(dataUrl);
    stopStream();
  };

  // Retake photo
  const handleRetake = () => {
    setCapturedPhoto(null);
    startCamera(facingMode);
  };

  // Confirm photo
  const handleConfirm = () => {
    if (capturedPhoto) {
      onCapture(capturedPhoto);
      onClose();
    }
  };

  // Flip front/back camera
  const handleFlipCamera = () => {
    setFacingMode(prev => (prev === 'environment' ? 'user' : 'environment'));
  };

  // File fallback upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      if (typeof ev.target?.result === 'string') {
        onCapture(ev.target.result);
        onClose();
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl flex flex-col text-white">
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-emerald-400" />
            <span className="font-bold text-sm text-slate-100">{title}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Viewport / Photo Preview */}
        <div className="relative bg-black aspect-4/3 sm:aspect-16/10 flex items-center justify-center overflow-hidden">
          {capturedPhoto ? (
            <img
              src={capturedPhoto}
              alt="Captured"
              className="w-full h-full object-contain bg-slate-950"
            />
          ) : errorMsg ? (
            <div className="p-6 text-center space-y-3 max-w-sm">
              <AlertCircle className="w-10 h-10 text-amber-400 mx-auto" />
              <p className="text-xs text-slate-300">{errorMsg}</p>
              <label className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition cursor-pointer">
                <ImageIcon className="w-4 h-4" />
                <span>Upload From Device Instead</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              {isLoading && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <div className="flex items-center gap-2 text-xs text-slate-300">
                    <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                    <span>Starting camera...</span>
                  </div>
                </div>
              )}
              {/* Camera Guide Lines */}
              <div className="absolute inset-8 border border-white/20 rounded-xl pointer-events-none" />
            </>
          )}

          <canvas ref={canvasRef} className="hidden" />
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between gap-3">
          {capturedPhoto ? (
            <>
              <button
                type="button"
                onClick={handleRetake}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition cursor-pointer flex items-center gap-1.5"
              >
                <RefreshCw className="w-4 h-4" /> Retake
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold shadow-lg shadow-emerald-600/30 transition cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" /> Use Photo
              </button>
            </>
          ) : !errorMsg ? (
            <>
              <button
                type="button"
                onClick={handleFlipCamera}
                className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
                title="Switch Camera (Front / Back)"
              >
                <RefreshCw className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handleSnap}
                disabled={isLoading}
                className="w-14 h-14 rounded-full border-4 border-white bg-emerald-500 hover:bg-emerald-400 active:scale-95 transition shadow-lg flex items-center justify-center cursor-pointer disabled:opacity-50"
                title="Capture Photo"
              >
                <div className="w-10 h-10 rounded-full bg-white/20 border border-white/40" />
              </button>

              <label className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer" title="Upload from Device File">
                <ImageIcon className="w-4 h-4" />
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </>
          ) : (
            <div className="w-full flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-200 text-xs font-bold"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
