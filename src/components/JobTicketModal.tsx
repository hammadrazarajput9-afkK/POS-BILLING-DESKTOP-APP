import React, { useState, useEffect } from 'react';
import { RepairTicket, RepairStatus } from '../types';
import { X, Wrench, Printer, CheckCircle2 } from 'lucide-react';
import { useToast } from './Toast';

interface JobTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (ticket: Omit<RepairTicket, 'id' | 'ticketNo' | 'date'>, existingId?: string) => void;
  editTicket?: RepairTicket | null;
  currency: string;
}

export const JobTicketModal: React.FC<JobTicketModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editTicket,
  currency,
}) => {
  const { showToast } = useToast();
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [device, setDevice] = useState('');
  const [problem, setProblem] = useState('');
  const [cost, setCost] = useState<number | ''>('');
  const [advancePaid, setAdvancePaid] = useState<number | ''>('');
  const [status, setStatus] = useState<RepairStatus>('Pending');
  const [technicianNotes, setTechnicianNotes] = useState('');

  useEffect(() => {
    if (editTicket) {
      setCustName(editTicket.custName);
      setCustPhone(editTicket.custPhone);
      setDevice(editTicket.device);
      setProblem(editTicket.problem);
      setCost(editTicket.cost);
      setAdvancePaid(editTicket.advancePaid || 0);
      setStatus(editTicket.status);
      setTechnicianNotes(editTicket.technicianNotes || '');
    } else {
      setCustName('');
      setCustPhone('');
      setDevice('');
      setProblem('');
      setCost('');
      setAdvancePaid('');
      setStatus('Pending');
      setTechnicianNotes('');
    }
  }, [editTicket, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!custName.trim() || !device.trim() || !problem.trim()) {
      showToast('Please fill all required repair details', 'warning');
      return;
    }

    onSave(
      {
        custName: custName.trim(),
        custPhone: custPhone.trim(),
        device: device.trim(),
        problem: problem.trim(),
        cost: Number(cost) || 0,
        advancePaid: Number(advancePaid) || 0,
        status,
        technicianNotes: technicianNotes.trim() || undefined,
      },
      editTicket ? editTicket.id : undefined
    );

    showToast(editTicket ? 'Job sheet updated' : 'Repair ticket logged successfully', 'success');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 border border-slate-100 animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
              <Wrench className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                {editTicket ? `Edit Job Sheet #${editTicket.ticketNo}` : 'New Repair Desk Ticket'}
              </h3>
              <p className="text-[11px] text-slate-500">Track device issue, customer contact, and estimated cost</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Customer Full Name *</label>
              <input
                type="text"
                required
                value={custName}
                onChange={e => setCustName(e.target.value)}
                placeholder="e.g. Ali Ahmed"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:border-blue-600 focus:bg-white transition"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Contact Phone Number *</label>
              <input
                type="text"
                required
                value={custPhone}
                onChange={e => setCustPhone(e.target.value)}
                placeholder="0300-1234567"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:border-blue-600 focus:bg-white transition"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Device Model & Color *</label>
              <input
                type="text"
                required
                value={device}
                onChange={e => setDevice(e.target.value)}
                placeholder="e.g. iPhone 13 Black / Vivo Y20"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:border-blue-600 focus:bg-white transition"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Job Status</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as RepairStatus)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:border-blue-600"
              >
                <option value="Pending">Pending</option>
                <option value="In-Progress">In-Progress</option>
                <option value="Ready">Ready for Delivery</option>
                <option value="Delivered">Delivered & Closed</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Reported Problem / Defect *</label>
            <textarea
              required
              rows={2}
              value={problem}
              onChange={e => setProblem(e.target.value)}
              placeholder="e.g. Glass cracked, Touch not working, Charging port loose, No display light"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-medium focus:outline-none focus:border-blue-600 focus:bg-white transition"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Estimated Cost ({currency})</label>
              <input
                type="number"
                min="0"
                value={cost}
                onChange={e => setCost(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="0"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono tabular-nums font-semibold focus:outline-none focus:border-blue-600 focus:bg-white transition"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Advance Received ({currency})</label>
              <input
                type="number"
                min="0"
                value={advancePaid}
                onChange={e => setAdvancePaid(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="0"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono tabular-nums font-semibold focus:outline-none focus:border-blue-600 focus:bg-white transition"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Technician Diagnosis / Notes</label>
            <input
              type="text"
              value={technicianNotes}
              onChange={e => setTechnicianNotes(e.target.value)}
              placeholder="e.g. IC replaced, tested OK / Customer password: 1234"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:border-blue-600 focus:bg-white transition"
            />
          </div>

          <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium text-xs transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-md shadow-amber-500/20 transition cursor-pointer"
            >
              {editTicket ? 'Update Ticket' : 'Create Job Ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
