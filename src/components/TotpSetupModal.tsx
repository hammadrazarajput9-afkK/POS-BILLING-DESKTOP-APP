import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  QrCode,
  Copy,
  Check,
  RefreshCw,
  X,
  Smartphone,
  Key,
  AlertCircle,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { generateTotpSetup, verifyTotpCode, TotpSetupResult } from '../utils/totp';
import { useToast } from './Toast';

interface TotpSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  adminEmail: string;
  adminName?: string;
  existingSecret?: string;
  onVerifySuccess: (newSecret: string) => void;
  title?: string;
  description?: string;
}

export const TotpSetupModal: React.FC<TotpSetupModalProps> = ({
  isOpen,
  onClose,
  adminEmail,
  adminName,
  existingSecret,
  onVerifySuccess,
  title = 'Setup Authenticator 2FA',
  description = 'Enhance your account security using Google Authenticator, Authy, or Microsoft Authenticator.',
}) => {
  const { showToast } = useToast();
  const [setupData, setSetupData] = useState<TotpSetupResult | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Initialize or generate TOTP secret and QR code on open
  useEffect(() => {
    if (isOpen) {
      setVerificationCode('');
      setErrorMsg(null);
      loadSetupData(existingSecret);
    }
  }, [isOpen, existingSecret, adminEmail]);

  const loadSetupData = async (secretToUse?: string) => {
    setIsGenerating(true);
    try {
      const res = await generateTotpSetup(adminEmail, secretToUse);
      setSetupData(res);
    } catch (err) {
      console.error('Failed to generate TOTP setup data:', err);
      showToast('Failed to generate QR code', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRefreshKey = () => {
    if (window.confirm('Are you sure you want to generate a new 2FA setup key? Your previous key will be invalidated.')) {
      setVerificationCode('');
      setErrorMsg(null);
      loadSetupData(); // fresh random secret
      showToast('Generated fresh 2FA setup key and QR code', 'info');
    }
  };

  const handleCopySecret = () => {
    if (!setupData?.secret) return;
    navigator.clipboard.writeText(setupData.secret);
    setCopied(true);
    showToast('Setup key copied to clipboard!', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (!setupData?.secret) return;
    setErrorMsg(null);

    const cleanCode = verificationCode.trim().replace(/\s+/g, '');
    if (!cleanCode || cleanCode.length !== 6) {
      setErrorMsg('Please enter the 6-digit code from your Authenticator app.');
      return;
    }

    const isValid = verifyTotpCode(setupData.secret, cleanCode);
    if (isValid) {
      showToast('2FA Security Verified & Locked In Successfully!', 'success');
      onVerifySuccess(setupData.secret);
      onClose();
    } else {
      setErrorMsg('Invalid 6-digit passcode. Please verify the code in your Authenticator app and try again.');
      showToast('Invalid 6-Digit Passcode!', 'error');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-700 via-indigo-600 to-violet-700 px-6 py-5 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 backdrop-blur-md rounded-xl border border-white/20">
              <ShieldCheck className="w-6 h-6 text-indigo-200" />
            </div>
            <div>
              <h3 className="text-lg font-black tracking-tight">{title}</h3>
              <p className="text-xs text-indigo-100/90 font-medium">{adminEmail}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-indigo-100 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Content */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          <p className="text-xs text-slate-600 leading-relaxed font-medium">
            {description}
          </p>

          {/* Step 1: Scan QR Code */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col items-center justify-center text-center space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <Smartphone className="w-4 h-4 text-indigo-600" />
              <span>Step 1: Scan QR Code with App</span>
            </div>

            {isGenerating ? (
              <div className="w-48 h-48 flex items-center justify-center">
                <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
              </div>
            ) : setupData?.qrDataUrl ? (
              <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-xs">
                <img
                  src={setupData.qrDataUrl}
                  alt="2FA Setup QR Code"
                  className="w-44 h-44 object-contain rounded-lg select-none"
                />
              </div>
            ) : (
              <div className="text-xs text-rose-500 font-semibold p-4">
                Failed to render QR Code. Use manual setup key below.
              </div>
            )}

            <p className="text-[11px] text-slate-500">
              Open <strong>Google Authenticator</strong>, <strong>Authy</strong>, or <strong>Microsoft Authenticator</strong> on your phone and tap <em>Add Account (+)</em> to scan.
            </p>
          </div>

          {/* Step 2: Manual Key Option */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700">
              <span className="flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-indigo-600" />
                <span>Manual Setup Key</span>
              </span>
              <button
                type="button"
                onClick={handleRefreshKey}
                className="text-[11px] text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 transition"
                title="Generate new key"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Refresh Key</span>
              </button>
            </div>

            <div className="flex items-center gap-2 bg-indigo-50/70 border border-indigo-200 rounded-xl p-2.5">
              <code className="text-xs font-mono font-black text-indigo-950 flex-1 tracking-widest break-all select-all px-1">
                {setupData?.secret || 'LOADING...'}
              </code>
              <button
                type="button"
                onClick={handleCopySecret}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs transition shrink-0"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Step 3: Verification Input */}
          <form onSubmit={handleVerify} className="space-y-4 pt-2 border-t border-slate-100">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Step 2: Enter 6-Digit Code from Authenticator App
              </label>
              <input
                type="text"
                maxLength={6}
                value={verificationCode}
                onChange={(e) => {
                  setVerificationCode(e.target.value.replace(/\D/g, ''));
                  setErrorMsg(null);
                }}
                placeholder="e.g. 123456"
                className="w-full text-center text-2xl font-mono font-black tracking-widest py-3 px-4 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 focus:bg-white text-slate-900 transition"
                autoComplete="off"
              />
            </div>

            {errorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span className="font-semibold">{errorMsg}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={verificationCode.length !== 6}
              className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl shadow-lg shadow-indigo-600/20 active:scale-[0.98] transition flex items-center justify-center gap-2"
            >
              <ShieldCheck className="w-5 h-5" />
              <span>Verify & Lock In 2FA Security</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
