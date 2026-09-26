import React, { useState, useMemo } from 'react';
import { RepairTicket, RepairStatus, ShopSettings } from '../types';
import {
  Search,
  Plus,
  Wrench,
  Clock,
  CheckCircle2,
  CheckCircle,
  Truck,
  Edit2,
  Printer,
  Trash2,
  Phone
} from 'lucide-react';
import { useToast } from './Toast';

interface RepairsTabProps {
  repairs: RepairTicket[];
  settings: ShopSettings;
  onOpenAddModal: () => void;
  onOpenEditModal: (ticket: RepairTicket) => void;
  onUpdateStatus: (id: string, status: RepairStatus) => void;
  onDeleteTicket: (id: string) => void;
}

export const RepairsTab: React.FC<RepairsTabProps> = ({
  repairs,
  settings,
  onOpenAddModal,
  onOpenEditModal,
  onUpdateStatus,
  onDeleteTicket,
}) => {
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [printSlipTicket, setPrintSlipTicket] = useState<RepairTicket | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return repairs.filter(r => {
      const matchSearch =
        !q ||
        r.ticketNo.toLowerCase().includes(q) ||
        r.custName.toLowerCase().includes(q) ||
        r.custPhone.toLowerCase().includes(q) ||
        r.device.toLowerCase().includes(q) ||
        r.problem.toLowerCase().includes(q);
      const matchStatus = statusFilter === 'ALL' || r.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [repairs, search, statusFilter]);

  const pendingCount = useMemo(() => repairs.filter(r => r.status === 'Pending').length, [repairs]);
  const inProgressCount = useMemo(() => repairs.filter(r => r.status === 'In-Progress').length, [repairs]);
  const readyCount = useMemo(() => repairs.filter(r => r.status === 'Ready').length, [repairs]);
  const deliveredCount = useMemo(() => repairs.filter(r => r.status === 'Delivered').length, [repairs]);

  const handlePrintSlip = (ticket: RepairTicket) => {
    setPrintSlipTicket(ticket);
    setTimeout(() => {
      window.print();
    }, 150);
  };

  return (
    <div className="space-y-6">
      {/* Repair Desk Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4.5 shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Pending Diagnosis
          </span>
          <h3 className="text-xl font-extrabold text-amber-600 font-mono tabular-nums mt-1">
            {pendingCount} Tickets
          </h3>
          <p className="text-xs text-slate-400 mt-1">Awaiting bench check</p>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-2xl p-4.5 shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            In-Progress Repairs
          </span>
          <h3 className="text-xl font-extrabold text-blue-600 font-mono tabular-nums mt-1">
            {inProgressCount} Tickets
          </h3>
          <p className="text-xs text-slate-400 mt-1">Currently on technician desk</p>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-2xl p-4.5 shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Ready for Delivery
          </span>
          <h3 className="text-xl font-extrabold text-emerald-600 font-mono tabular-nums mt-1">
            {readyCount} Devices
          </h3>
          <p className="text-xs text-slate-400 mt-1">Tested & awaiting customer</p>
        </div>

        <div className="bg-white border border-slate-200/90 rounded-2xl p-4.5 shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Completed / Delivered
          </span>
          <h3 className="text-xl font-extrabold text-slate-700 font-mono tabular-nums mt-1">
            {deliveredCount} Devices
          </h3>
          <p className="text-xs text-slate-400 mt-1">Closed successfully</p>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 space-y-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h3 className="font-bold text-slate-900 text-base">Repair Desk & Job Sheet Tickets</h3>
            <p className="text-xs text-slate-500">
              Manage mobile repairs, hardware defects, estimated costs, and customer claim slips
            </p>
          </div>
          <button
            onClick={onOpenAddModal}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl shadow-md shadow-amber-500/20 transition flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" /> New Job Sheet
          </button>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by ticket #, customer name, phone, device model, or fault..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-amber-500 focus:bg-white transition"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {['ALL', 'Pending', 'In-Progress', 'Ready', 'Delivered'].map(status => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                  statusFilter === status
                    ? 'bg-amber-500 text-white font-bold shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                }`}
              >
                {status === 'ALL' ? 'All Tickets' : status}
              </button>
            ))}
          </div>
        </div>

        {/* Tickets Table */}
        <div className="border border-slate-200/80 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="p-3">Ticket #</th>
                  <th className="p-3">Customer & Contact</th>
                  <th className="p-3">Device Model</th>
                  <th className="p-3">Reported Issue</th>
                  <th className="p-3 text-right">Est. Cost</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-center">Update Progress</th>
                  <th className="p-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-slate-400">
                      <Wrench className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                      <p className="font-semibold text-slate-700">No repair tickets found</p>
                      <p className="text-[11px] text-slate-400">Create a job sheet to start tracking repairs</p>
                    </td>
                  </tr>
                ) : (
                  filtered.map(ticket => (
                    <tr key={ticket.id} className="hover:bg-slate-50/60 transition">
                      <td className="p-3 font-mono font-bold text-amber-600">
                        #{ticket.ticketNo}
                      </td>
                      <td className="p-3">
                        <p className="font-bold text-slate-900 leading-snug">{ticket.custName}</p>
                        <p className="text-[11px] text-slate-500 font-mono flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3 text-slate-400" /> {ticket.custPhone}
                        </p>
                      </td>
                      <td className="p-3 font-semibold text-slate-800">
                        {ticket.device}
                      </td>
                      <td className="p-3 text-slate-600 max-w-xs">
                        <p className="line-clamp-2">{ticket.problem}</p>
                        {ticket.technicianNotes && (
                          <p className="text-[10px] text-slate-400 mt-0.5 italic">
                            Note: {ticket.technicianNotes}
                          </p>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <p className="font-mono tabular-nums font-bold text-slate-900">
                          {settings.currency} {ticket.cost.toLocaleString()}
                        </p>
                        {ticket.advancePaid ? (
                          <p className="text-[10px] text-emerald-600 font-mono">
                            Adv: {settings.currency} {ticket.advancePaid.toLocaleString()}
                          </p>
                        ) : null}
                      </td>
                      <td className="p-3 text-center">
                        <span
                          className={`font-medium text-[11px] px-2.5 py-0.5 rounded-full ${
                            ticket.status === 'Ready'
                              ? 'bg-emerald-50 text-emerald-700'
                              : ticket.status === 'In-Progress'
                              ? 'bg-blue-50 text-blue-700'
                              : ticket.status === 'Delivered'
                              ? 'bg-slate-100 text-slate-700'
                              : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {ticket.status}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <select
                          value={ticket.status}
                          onChange={e => {
                            onUpdateStatus(ticket.id, e.target.value as RepairStatus);
                            showToast(`Ticket #${ticket.ticketNo} updated to ${e.target.value}`, 'info');
                          }}
                          className="bg-slate-50 border border-slate-200 text-xs font-semibold rounded-lg px-2.5 py-1 outline-none focus:border-amber-500"
                        >
                          <option value="Pending">Pending</option>
                          <option value="In-Progress">In-Progress</option>
                          <option value="Ready">Ready</option>
                          <option value="Delivered">Delivered</option>
                        </select>
                      </td>
                      <td className="p-3 text-center">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handlePrintSlip(ticket)}
                            className="p-1 text-slate-500 hover:text-amber-600 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                            title="Print Claim Slip"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenEditModal(ticket)}
                            className="p-1 text-slate-500 hover:text-blue-600 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                            title="Edit Ticket"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm(`Delete repair ticket #${ticket.ticketNo}?`)) {
                                onDeleteTicket(ticket.id);
                                showToast('Ticket deleted', 'info');
                              }
                            }}
                            className="p-1 text-slate-500 hover:text-rose-600 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                            title="Delete Ticket"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Hidden Thermal Job Sheet Print Slip Area for window.print() */}
      {printSlipTicket && (
        <div id="printable-receipt-area" className="hidden font-mono text-xs space-y-2 p-2">
          <div className="text-center border-b border-dashed border-slate-300 pb-2">
            <h2 className="font-extrabold text-sm uppercase">{settings.shopName}</h2>
            <p className="text-[10px]">DEVICE REPAIR CLAIM SLIP</p>
            <p className="text-[10px]">Ph: {settings.phone}</p>
          </div>
          <div className="flex justify-between font-bold text-xs pt-1">
            <span>TICKET: #{printSlipTicket.ticketNo}</span>
            <span>{new Date(printSlipTicket.date).toLocaleDateString()}</span>
          </div>
          <div className="border-t border-b border-dashed border-slate-300 py-2 space-y-1 text-[11px]">
            <p><strong>Customer:</strong> {printSlipTicket.custName}</p>
            <p><strong>Phone:</strong> {printSlipTicket.custPhone}</p>
            <p><strong>Device:</strong> {printSlipTicket.device}</p>
            <p><strong>Reported Issue:</strong> {printSlipTicket.problem}</p>
            <p><strong>Est. Cost:</strong> {settings.currency} {printSlipTicket.cost.toLocaleString()}</p>
            <p><strong>Advance Paid:</strong> {settings.currency} {(printSlipTicket.advancePaid || 0).toLocaleString()}</p>
            <p><strong>Balance Due:</strong> {settings.currency} {(printSlipTicket.cost - (printSlipTicket.advancePaid || 0)).toLocaleString()}</p>
          </div>
          <div className="text-center pt-2 text-[10px] text-slate-600">
            <p>Please present this slip at the time of device pickup.</p>
            <p>Not responsible for uncollected devices after 30 days.</p>
          </div>
        </div>
      )}
    </div>
  );
};
