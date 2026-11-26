import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  Camera,
  ChevronRight,
  Delete,
  FileText,
  Image as ImageIcon,
  Upload,
  X,
} from 'lucide-react';
import { evaluateCalculatorExpression } from '../utils/ledgerFormatters';
import { compressImage } from '../utils/imageCompressor';
import { CameraCaptureModal } from './CameraCaptureModal';
import { useToast } from './Toast';

export interface LedgerCalculatorEntryInitial {
  txId?: string;
  type: 'credit' | 'payment';
  amount?: number;
  note?: string;
  date?: string;
  receiptImage?: string;
}

interface LedgerCalculatorEntryProps {
  isOpen: boolean;
  onClose: () => void;
  customerName: string;
  currentBalance: number;
  currency: string;
  initial: LedgerCalculatorEntryInitial;
  onSave: (payload: {
    txId?: string;
    type: 'credit' | 'payment';
    amount: number;
    note?: string;
    date?: string;
    receiptImage?: string;
  }) => void;
}

export const LedgerCalculatorEntry: React.FC<LedgerCalculatorEntryProps> = ({
  isOpen,
  onClose,
  customerName,
  currentBalance,
  currency,
  initial,
  onSave,
}) => {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const noteInputRef = useRef<HTMLInputElement>(null);

  const [entryType, setEntryType] = useState<'credit' | 'payment'>(initial.type);
  const [expression, setExpression] = useState<string>(
    initial.amount && initial.amount > 0 ? String(initial.amount) : ''
  );
  const [memoryVal, setMemoryVal] = useState<number>(0);
  const [note, setNote] = useState<string>(initial.note || '');
  const [showDetailsEditor, setShowDetailsEditor] = useState<boolean>(Boolean(initial.note));
  const [entryDate, setEntryDate] = useState<string>(() => {
    if (initial.date) {
      const d = new Date(initial.date);
      if (!Number.isNaN(d.getTime())) {
        const offset = d.getTimezoneOffset() * 60000;
        return new Date(d.getTime() - offset).toISOString().slice(0, 16);
      }
    }
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - offset).toISOString().slice(0, 16);
  });
  const [receiptImage, setReceiptImage] = useState<string>(initial.receiptImage || '');
  const [isCameraOpen, setIsCameraOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setEntryType(initial.type);
    setExpression(initial.amount && initial.amount > 0 ? String(initial.amount) : '');
    setNote(initial.note || '');
    setShowDetailsEditor(Boolean(initial.note));
    setReceiptImage(initial.receiptImage || '');
    if (initial.date) {
      const d = new Date(initial.date);
      if (!Number.isNaN(d.getTime())) {
        const offset = d.getTimezoneOffset() * 60000;
        setEntryDate(new Date(d.getTime() - offset).toISOString().slice(0, 16));
      }
    } else {
      const now = new Date();
      const offset = now.getTimezoneOffset() * 60000;
      setEntryDate(new Date(now.getTime() - offset).toISOString().slice(0, 16));
    }
  }, [isOpen, initial]);

  const computedAmount = useMemo(() => evaluateCalculatorExpression(expression), [expression]);
  const hasOperators = /[+\-×÷*/%]/.test(expression.replace(/^-/, ''));

  if (!isOpen) return null;

  const isGave = entryType === 'credit';

  const appendChar = (ch: string) => {
    setExpression(prev => {
      const operators = ['+', '-', '×', '÷', '*', '/'];
      if (operators.includes(ch)) {
        if (!prev) return '';
        const last = prev[prev.length - 1];
        if (operators.includes(last)) {
          return prev.slice(0, -1) + ch;
        }
        return prev + ch;
      }
      if (ch === '.') {
        const parts = prev.split(/[+\-×÷*/%]/);
        const currentSeg = parts[parts.length - 1] || '';
        if (currentSeg.includes('.')) return prev;
        return prev === '' ? '0.' : prev + '.';
      }
      if (ch === '%') {
        if (!prev || operators.includes(prev[prev.length - 1])) return prev;
        return prev + '%';
      }
      return prev === '0' ? ch : prev + ch;
    });
  };

  const handleEvaluate = () => {
    if (!expression) return;
    const res = evaluateCalculatorExpression(expression);
    setExpression(res > 0 ? String(res) : '');
  };

  const handleBackspace = () => {
    setExpression(prev => prev.slice(0, -1));
  };

  const handleClear = () => {
    setExpression('');
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file, 700, 0.7);
      setReceiptImage(compressed);
      showToast('Bill / Receipt photo attached!', 'success');
    } catch {
      showToast('Could not attach image', 'warning');
    }
  };

  const handleSubmit = async () => {
    const finalAmt = evaluateCalculatorExpression(expression);
    if (!finalAmt || finalAmt <= 0) {
      showToast('Please enter an amount greater than 0', 'warning');
      return;
    }

    let optImg = receiptImage;
    if (optImg && optImg.startsWith('data:image')) {
      try {
        optImg = await compressImage(optImg, 700, 0.7);
      } catch {
        // Keep original if compression fails
      }
    }

    const isoDate = entryDate ? new Date(entryDate).toISOString() : new Date().toISOString();

    onSave({
      txId: initial.txId,
      type: entryType,
      amount: finalAmt,
      note: note.trim() || undefined,
      date: isoDate,
      receiptImage: optImg || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-[60] bg-slate-50 flex flex-col overflow-hidden animate-in fade-in pb-[env(safe-area-inset-bottom,0px)]">
      {/* Colored Header (Rose/Red for You Gave, Emerald Green for You Got) */}
      <div
        className={`app-fullscreen-modal-header px-3 sm:px-5 pt-[calc(env(safe-area-inset-top,0px)+0.85rem)] sm:pt-3 pb-3 text-white flex items-center justify-between gap-2 shrink-0 shadow-xs transition-colors ${
          isGave ? 'bg-rose-600' : 'bg-emerald-600'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full hover:bg-white/15 flex items-center justify-center transition cursor-pointer shrink-0"
            aria-label="Back to Ledger"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-sm sm:text-base font-extrabold tracking-tight truncate">
            {isGave
              ? `You Gave ${currency} ${computedAmount.toLocaleString()} to ${customerName}`
              : `You Got ${currency} ${computedAmount.toLocaleString()} From ${customerName}`}
          </h2>
        </div>

        {/* If editing an existing entry, allow switching You Gave / You Got */}
        {initial.txId && (
          <button
            type="button"
            onClick={() => setEntryType(prev => (prev === 'credit' ? 'payment' : 'credit'))}
            className="px-2.5 py-1 rounded-full bg-white/15 hover:bg-white/25 text-[11px] font-bold shrink-0 cursor-pointer"
          >
            Switch
          </button>
        )}
      </div>

      {/* Scrollable Middle Fields + Bottom Keypad */}
      <div className="flex-1 flex flex-col justify-between overflow-hidden max-w-xl w-full mx-auto">
        {/* Input Cards Stack */}
        <div className="p-3 sm:p-4 space-y-2.5 overflow-y-auto flex-1">
          {/* 1. Amount Box */}
          <div className="bg-white border border-slate-200/90 rounded-2xl px-3.5 py-2.5 shadow-2xs flex items-center gap-2">
            <span className="text-sm font-bold text-slate-500 shrink-0">{currency}</span>
            <input
              type="text"
              inputMode="decimal"
              value={expression}
              onChange={e => setExpression(e.target.value)}
              placeholder="0"
              className={`flex-1 bg-transparent text-lg sm:text-xl font-extrabold tabular-nums focus:outline-none min-w-0 ${
                isGave ? 'text-rose-600' : 'text-emerald-600'
              }`}
            />
            {hasOperators && computedAmount > 0 && (
              <span className="text-xs font-extrabold text-slate-500 tabular-nums shrink-0">
                = {computedAmount.toLocaleString()}
              </span>
            )}
            {!isGave && currentBalance > 0 && (
              <button
                type="button"
                onClick={() => setExpression(String(currentBalance))}
                className="px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-extrabold shrink-0 cursor-pointer"
              >
                Full
              </button>
            )}
            <button
              type="button"
              onClick={handleBackspace}
              className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center shrink-0 cursor-pointer"
              aria-label="Backspace"
            >
              <Delete className="w-4 h-4" />
            </button>
          </div>

          {/* 2. Add Items / Details & Date Card */}
          <div className="bg-white border border-slate-200/90 rounded-2xl shadow-2xs overflow-hidden">
            <button
              type="button"
              onClick={() => {
                setShowDetailsEditor(v => !v);
                setTimeout(() => noteInputRef.current?.focus(), 60);
              }}
              className="w-full px-3.5 py-3 flex items-center justify-between text-left hover:bg-slate-50/70 transition cursor-pointer"
            >
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="text-xs sm:text-sm font-semibold text-slate-700 truncate">
                  {note ? note : 'Add Items / Details'}
                </span>
              </div>
              <ChevronRight
                className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${
                  showDetailsEditor ? 'rotate-90 text-emerald-600' : ''
                }`}
              />
            </button>

            {showDetailsEditor && (
              <div className="px-3.5 pb-3 pt-1 border-t border-slate-100 space-y-2">
                <input
                  ref={noteInputRef}
                  type="text"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="e.g. Cash rcv, Y05 4/128, IMEI or Bill #"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:border-emerald-600 focus:bg-white"
                />
                <label className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-700">
                  <Calendar className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="text-[11px] font-bold text-slate-500 shrink-0">Date:</span>
                  <input
                    type="datetime-local"
                    value={entryDate}
                    onChange={e => setEntryDate(e.target.value)}
                    className="compact-mobile-input flex-1 bg-transparent font-bold text-[11px] text-slate-800 focus:outline-none"
                  />
                </label>
              </div>
            )}
          </div>

          {/* 3. Attach Photo / Receipt Card */}
          <div className="bg-white border border-slate-200/90 rounded-2xl px-3.5 py-2.5 shadow-2xs flex items-center justify-between gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
            {receiptImage ? (
              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                <img
                  src={receiptImage}
                  alt="Attached Receipt"
                  className="w-9 h-9 rounded-lg object-cover border border-slate-200 shrink-0"
                />
                <span className="text-xs font-bold text-emerald-700 truncate">
                  Bill / Receipt Photo Attached
                </span>
                <button
                  type="button"
                  onClick={() => setReceiptImage('')}
                  className="ml-auto p-1 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                  title="Remove photo"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 min-w-0">
                  <ImageIcon className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="text-xs sm:text-sm font-semibold text-slate-700 truncate">
                    Attach Photo / Receipt
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Upload className="w-3 h-3" />
                    Gallery
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsCameraOpen(true)}
                    className={`px-2.5 py-1.5 rounded-lg text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer ${
                      isGave ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'
                    }`}
                  >
                    <Camera className="w-3 h-3" />
                    Cam
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Bottom SAVE Button + Built-In Calculator Keypad */}
        <div className="bg-white border-t border-slate-200 px-3 pt-2.5 pb-3 space-y-2.5 shrink-0">
          <button
            type="button"
            onClick={handleSubmit}
            className={`w-full h-11 rounded-full text-white font-extrabold text-sm tracking-wide shadow-md transition cursor-pointer ${
              isGave
                ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20'
                : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
            }`}
          >
            SAVE
          </button>

          {/* 4x6 Calculator Keypad */}
          <div className="grid grid-cols-4 gap-1.5 select-none">
            {/* Row 1 */}
            <button
              type="button"
              onClick={handleClear}
              className="h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm cursor-pointer"
            >
              AC
            </button>
            <button
              type="button"
              onClick={() => {
                if (computedAmount > 0) {
                  setMemoryVal(m => m + computedAmount);
                  showToast(`Memory: ${(memoryVal + computedAmount).toLocaleString()}`, 'info');
                }
              }}
              className="h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm cursor-pointer"
            >
              M+
            </button>
            <button
              type="button"
              onClick={() => {
                if (memoryVal > 0) {
                  setExpression(String(memoryVal));
                } else {
                  setMemoryVal(0);
                }
              }}
              className="h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm cursor-pointer"
            >
              M-
            </button>
            <button
              type="button"
              onClick={handleBackspace}
              className="h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm flex items-center justify-center cursor-pointer"
              aria-label="Delete digit"
            >
              <Delete className="w-4.5 h-4.5" />
            </button>

            {/* Row 2 */}
            <button
              type="button"
              onClick={() => appendChar('%')}
              className="h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-base cursor-pointer"
            >
              %
            </button>
            <button
              type="button"
              onClick={() => appendChar('÷')}
              className="h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-lg cursor-pointer"
            >
              ÷
            </button>
            <button
              type="button"
              onClick={() => appendChar('×')}
              className="h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-lg cursor-pointer"
            >
              ×
            </button>
            <button
              type="button"
              onClick={() => appendChar('−')}
              className="h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-lg cursor-pointer"
            >
              −
            </button>

            {/* Row 3 */}
            {['7', '8', '9'].map(n => (
              <button
                key={n}
                type="button"
                onClick={() => appendChar(n)}
                className="h-11 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200/70 text-slate-900 font-bold text-lg tabular-nums cursor-pointer"
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              onClick={() => appendChar('+')}
              className="h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-lg cursor-pointer"
            >
              +
            </button>

            {/* Row 4 */}
            {['4', '5', '6'].map(n => (
              <button
                key={n}
                type="button"
                onClick={() => appendChar(n)}
                className="h-11 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200/70 text-slate-900 font-bold text-lg tabular-nums cursor-pointer"
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              onClick={handleEvaluate}
              className="h-11 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-lg cursor-pointer"
            >
              =
            </button>

            {/* Row 5 & 6 */}
            {['1', '2', '3'].map(n => (
              <button
                key={n}
                type="button"
                onClick={() => appendChar(n)}
                className="h-11 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200/70 text-slate-900 font-bold text-lg tabular-nums cursor-pointer"
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              onClick={handleEvaluate}
              className="row-span-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-extrabold text-lg flex items-center justify-center cursor-pointer"
              title="Calculate Total"
            >
              ↵
            </button>

            <button
              type="button"
              onClick={() => appendChar('0')}
              className="col-span-2 h-11 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200/70 text-slate-900 font-bold text-lg tabular-nums cursor-pointer"
            >
              0
            </button>
            <button
              type="button"
              onClick={() => appendChar('.')}
              className="h-11 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200/70 text-slate-900 font-bold text-lg cursor-pointer"
            >
              .
            </button>
          </div>
        </div>
      </div>

      {/* Camera Modal */}
      <CameraCaptureModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        title="Capture Receipt / Bill Photo"
        onCapture={async dataUrl => {
          try {
            const compressed = await compressImage(dataUrl, 700, 0.7);
            setReceiptImage(compressed);
            showToast('Receipt photo captured!', 'success');
          } catch {
            setReceiptImage(dataUrl);
          }
        }}
      />
    </div>
  );
};
