import React, { useState, useMemo } from 'react';
import { AppData } from '../types';
import { Calendar, RotateCcw, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';

interface FinancialChartProps {
  data: AppData;
}

type MetricType = 'sales' | 'profit' | 'purchases' | 'payments' | 'expenses';
type Timeframe = 'daily' | 'weekly' | 'monthly' | 'yearly';

export const FinancialChart: React.FC<FinancialChartProps> = ({ data }) => {
  const [metric, setMetric] = useState<MetricType>('sales');
  const [timeframe, setTimeframe] = useState<Timeframe>('daily');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [hoveredPoint, setHoveredPoint] = useState<{ label: string; value: number; x: number; y: number } | null>(null);

  // Calculate aggregated data points based on filters
  const chartData = useMemo(() => {
    const isCustomRange = Boolean(startDate && endDate);

    // Helper to calculate total payment inflow for a timestamp window
    const getPaymentInflowForRange = (timeMin: number, timeMax: number) => {
      let total = 0;
      (data.sales || []).forEach(s => {
        const t = new Date(s.date).getTime();
        if (t >= timeMin && t < timeMax) {
          const paid = s.amountPaid !== undefined ? s.amountPaid : (s.invoiceType === 'credit' ? 0 : s.grandTotal);
          total += paid;
        }
      });
      (data.khata || []).forEach(cust => {
        (cust.history || []).forEach(tx => {
          if (tx.type === 'payment') {
            const t = new Date(tx.date).getTime();
            if (t >= timeMin && t < timeMax) {
              total += tx.amount || 0;
            }
          }
        });
      });
      return total;
    };

    const getPaymentInflowForPrefix = (prefix: string) => {
      let total = 0;
      (data.sales || []).forEach(s => {
        if (s.date.startsWith(prefix)) {
          const paid = s.amountPaid !== undefined ? s.amountPaid : (s.invoiceType === 'credit' ? 0 : s.grandTotal);
          total += paid;
        }
      });
      (data.khata || []).forEach(cust => {
        (cust.history || []).forEach(tx => {
          if (tx.type === 'payment' && tx.date.startsWith(prefix)) {
            total += tx.amount || 0;
          }
        });
      });
      return total;
    };

    if (isCustomRange) {
      const start = new Date(startDate).getTime();
      const end = new Date(endDate).getTime() + 86400000;
      const step = (end - start) / 6;

      const points = [];
      for (let i = 0; i <= 6; i++) {
        const pTime = start + step * i;
        const dObj = new Date(pTime);
        const label = `${dObj.getMonth() + 1}/${dObj.getDate()}`;
        points.push({ label, timeMin: pTime - step / 2, timeMax: pTime + step / 2 });
      }

      return points.map(pt => {
        let val = 0;
        if (metric === 'sales') {
          val = data.sales
            .filter(s => {
              const t = new Date(s.date).getTime();
              return t >= pt.timeMin && t < pt.timeMax;
            })
            .reduce((acc, s) => acc + s.grandTotal, 0);
        } else if (metric === 'profit') {
          val = data.sales
            .filter(s => {
              const t = new Date(s.date).getTime();
              return t >= pt.timeMin && t < pt.timeMax;
            })
            .reduce((acc, s) => acc + s.netProfit, 0);
        } else if (metric === 'purchases') {
          val = data.purchasesLedger
            .filter(p => {
              const t = new Date(p.date).getTime();
              return t >= pt.timeMin && t < pt.timeMax;
            })
            .reduce((acc, p) => acc + p.total, 0);
        } else if (metric === 'payments') {
          val = getPaymentInflowForRange(pt.timeMin, pt.timeMax);
        } else if (metric === 'expenses') {
          val = data.expenses
            .filter(e => {
              const t = new Date(e.date).getTime();
              return t >= pt.timeMin && t < pt.timeMax;
            })
            .reduce((acc, e) => acc + e.amount, 0);
        }
        return { label: pt.label, value: Math.max(0, val) };
      });
    }

    if (timeframe === 'daily') {
      // Last 7 days
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const points = [];
      const now = new Date();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const dayStr = days[d.getDay()];
        const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        points.push({ label: `${dayStr} ${d.getDate()}`, key: dateKey });
      }

      return points.map(pt => {
        let val = 0;
        if (metric === 'sales') {
          val = data.sales
            .filter(s => s.date.startsWith(pt.key))
            .reduce((acc, s) => acc + s.grandTotal, 0);
        } else if (metric === 'profit') {
          val = data.sales
            .filter(s => s.date.startsWith(pt.key))
            .reduce((acc, s) => acc + s.netProfit, 0);
        } else if (metric === 'purchases') {
          val = data.purchasesLedger
            .filter(p => p.date.startsWith(pt.key))
            .reduce((acc, p) => acc + p.total, 0);
        } else if (metric === 'payments') {
          val = getPaymentInflowForPrefix(pt.key);
        } else if (metric === 'expenses') {
          val = data.expenses
            .filter(e => e.date.startsWith(pt.key))
            .reduce((acc, e) => acc + e.amount, 0);
        }
        return { label: pt.label, value: Math.max(0, val) };
      });
    }

    if (timeframe === 'weekly') {
      // 4 Weeks
      const points = [
        { label: 'Week 1', daysBackMin: 28, daysBackMax: 21 },
        { label: 'Week 2', daysBackMin: 21, daysBackMax: 14 },
        { label: 'Week 3', daysBackMin: 14, daysBackMax: 7 },
        { label: 'Week 4 (Current)', daysBackMin: 7, daysBackMax: 0 },
      ];

      const now = Date.now();
      return points.map(pt => {
        const minTime = now - pt.daysBackMin * 86400000;
        const maxTime = now - pt.daysBackMax * 86400000;

        let val = 0;
        if (metric === 'sales') {
          val = data.sales
            .filter(s => {
              const t = new Date(s.date).getTime();
              return t >= minTime && t <= maxTime;
            })
            .reduce((acc, s) => acc + s.grandTotal, 0);
        } else if (metric === 'profit') {
          val = data.sales
            .filter(s => {
              const t = new Date(s.date).getTime();
              return t >= minTime && t <= maxTime;
            })
            .reduce((acc, s) => acc + s.netProfit, 0);
        } else if (metric === 'purchases') {
          val = data.purchasesLedger
            .filter(p => {
              const t = new Date(p.date).getTime();
              return t >= minTime && t <= maxTime;
            })
            .reduce((acc, p) => acc + p.total, 0);
        } else if (metric === 'payments') {
          val = getPaymentInflowForRange(minTime, maxTime);
        } else if (metric === 'expenses') {
          val = data.expenses
            .filter(e => {
              const t = new Date(e.date).getTime();
              return t >= minTime && t <= maxTime;
            })
            .reduce((acc, e) => acc + e.amount, 0);
        }
        return { label: pt.label, value: Math.max(0, val) };
      });
    }

    if (timeframe === 'monthly') {
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const currentYear = new Date().getFullYear();

      return monthNames.map((month, idx) => {
        const prefix = `${currentYear}-${String(idx + 1).padStart(2, '0')}`;
        let val = 0;
        if (metric === 'sales') {
          val = data.sales.filter(s => s.date.startsWith(prefix)).reduce((acc, s) => acc + s.grandTotal, 0);
        } else if (metric === 'profit') {
          val = data.sales.filter(s => s.date.startsWith(prefix)).reduce((acc, s) => acc + s.netProfit, 0);
        } else if (metric === 'purchases') {
          val = data.purchasesLedger.filter(p => p.date.startsWith(prefix)).reduce((acc, p) => acc + p.total, 0);
        } else if (metric === 'payments') {
          val = getPaymentInflowForPrefix(prefix);
        } else if (metric === 'expenses') {
          val = data.expenses.filter(e => e.date.startsWith(prefix)).reduce((acc, e) => acc + e.amount, 0);
        }
        return { label: month, value: Math.max(0, val) };
      });
    }

    // Yearly
    const years = ['2023', '2024', '2025', '2026'];
    return years.map(yr => {
      let val = 0;
      if (metric === 'sales') {
        val = data.sales.filter(s => s.date.startsWith(yr)).reduce((acc, s) => acc + s.grandTotal, 0);
      } else if (metric === 'profit') {
        val = data.sales.filter(s => s.date.startsWith(yr)).reduce((acc, s) => acc + s.netProfit, 0);
      } else if (metric === 'purchases') {
        val = data.purchasesLedger.filter(p => p.date.startsWith(yr)).reduce((acc, p) => acc + p.total, 0);
      } else if (metric === 'payments') {
        val = getPaymentInflowForPrefix(yr);
      } else if (metric === 'expenses') {
        val = data.expenses.filter(e => e.date.startsWith(yr)).reduce((acc, e) => acc + e.amount, 0);
      }
      return { label: yr, value: Math.max(0, val) };
    });
  }, [data, metric, timeframe, startDate, endDate]);

  const totalPeriod = useMemo(() => {
    return chartData.reduce((acc, item) => acc + item.value, 0);
  }, [chartData]);

  const maxVal = useMemo(() => {
    const m = Math.max(...chartData.map(d => d.value), 0);
    return m === 0 ? 1000 : m;
  }, [chartData]);

  const metricColor = useMemo(() => {
    switch (metric) {
      case 'sales':
        return { stroke: '#2563eb', fill: 'url(#gradient-blue)', hex: '#2563eb' };
      case 'profit':
        return { stroke: '#059669', fill: 'url(#gradient-green)', hex: '#059669' };
      case 'purchases':
        return { stroke: '#d97706', fill: 'url(#gradient-amber)', hex: '#d97706' };
      case 'payments':
        return { stroke: '#7c3aed', fill: 'url(#gradient-purple)', hex: '#7c3aed' };
      case 'expenses':
        return { stroke: '#e11d48', fill: 'url(#gradient-rose)', hex: '#e11d48' };
    }
  }, [metric]);

  // SVG coordinate calculations
  const width = 800;
  const height = 240;
  const paddingX = 40;
  const paddingY = 24;

  const pointsString = useMemo(() => {
    if (chartData.length === 0) return '';
    const stepX = (width - paddingX * 2) / (chartData.length - 1 || 1);
    return chartData
      .map((item, index) => {
        const x = paddingX + index * stepX;
        const normalizedY = 1 - item.value / (maxVal * 1.15 || 1);
        const y = paddingY + normalizedY * (height - paddingY * 2);
        return `${x},${y}`;
      })
      .join(' ');
  }, [chartData, maxVal]);

  const areaPath = useMemo(() => {
    if (chartData.length === 0) return '';
    const stepX = (width - paddingX * 2) / (chartData.length - 1 || 1);
    const startX = paddingX;
    const endX = paddingX + (chartData.length - 1) * stepX;
    const bottomY = height - paddingY;

    const points = chartData.map((item, index) => {
      const x = paddingX + index * stepX;
      const normalizedY = 1 - item.value / (maxVal * 1.15 || 1);
      const y = paddingY + normalizedY * (height - paddingY * 2);
      return { x, y };
    });

    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      path += ` L ${points[i].x} ${points[i].y}`;
    }
    path += ` L ${endX} ${bottomY} L ${startX} ${bottomY} Z`;
    return path;
  }, [chartData, maxVal]);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5 shadow-xs">
      {/* Top Header & Selector Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-600" />
            <h3 className="font-bold text-slate-900 text-lg">Financial Performance & Analytics</h3>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Visualize live sales, net profits, inventory purchases, and shop expenses
          </p>
        </div>

        {/* Metric Selector & Timeframe Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={metric}
            onChange={e => setMetric(e.target.value as MetricType)}
            className="bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl px-3 py-2 outline-none focus:border-blue-600 focus:bg-white transition"
          >
            <option value="sales">Sales Revenue ({data.settings.currency})</option>
            <option value="profit">Net Profit ({data.settings.currency})</option>
            <option value="purchases">Purchases Ledger ({data.settings.currency})</option>
            <option value="payments">Cash Inflow ({data.settings.currency})</option>
            <option value="expenses">Shop Expenses ({data.settings.currency})</option>
          </select>

          {/* Timeframe Buttons */}
          <div className="inline-flex bg-slate-100 p-1 rounded-xl gap-1 text-xs font-semibold text-slate-600">
            {(['daily', 'weekly', 'monthly', 'yearly'] as Timeframe[]).map(tf => (
              <button
                key={tf}
                type="button"
                onClick={() => {
                  setTimeframe(tf);
                  setStartDate('');
                  setEndDate('');
                }}
                className={`px-3 py-1.5 rounded-lg capitalize transition-colors ${
                  timeframe === tf && !startDate
                    ? 'bg-white text-blue-600 shadow-xs font-bold'
                    : 'hover:text-slate-900'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Date Filter & Aggregation Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/70 p-3 rounded-xl border border-slate-200/80 text-xs text-slate-600">
        <div className="flex flex-wrap items-center gap-2">
          <Calendar className="w-4 h-4 text-blue-600" />
          <span className="font-semibold text-slate-700">Specific Range:</span>
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="bg-white border border-slate-200 px-2.5 py-1 rounded-lg text-xs font-medium focus:outline-none focus:border-blue-600"
          />
          <span className="text-slate-400">to</span>
          <input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            className="bg-white border border-slate-200 px-2.5 py-1 rounded-lg text-xs font-medium focus:outline-none focus:border-blue-600"
          />
          {(startDate || endDate) && (
            <button
              onClick={() => {
                setStartDate('');
                setEndDate('');
              }}
              className="text-blue-600 hover:text-blue-700 font-semibold text-xs flex items-center gap-1 ml-2"
            >
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <span className="text-slate-500">Period Total:</span>
          <span className="font-mono tabular-nums font-bold text-slate-900 text-sm">
            {data.settings.currency} {totalPeriod.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Interactive SVG Chart Canvas */}
      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-56 sm:h-64 select-none"
          onMouseLeave={() => setHoveredPoint(null)}
        >
          <defs>
            <linearGradient id="gradient-blue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563eb" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#2563eb" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="gradient-green" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#059669" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#059669" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="gradient-amber" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#d97706" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#d97706" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="gradient-purple" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="gradient-rose" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#e11d48" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#e11d48" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid horizontal dashed guidelines */}
          {[0.25, 0.5, 0.75, 1].map(ratio => {
            const y = paddingY + (1 - ratio) * (height - paddingY * 2);
            return (
              <g key={ratio}>
                <line
                  x1={paddingX}
                  y1={y}
                  x2={width - paddingX}
                  y2={y}
                  stroke="#f1f5f9"
                  strokeDasharray="4 4"
                  strokeWidth="1.5"
                />
                <text
                  x={paddingX - 8}
                  y={y + 3}
                  textAnchor="end"
                  className="text-[9px] fill-slate-400 font-mono"
                >
                  {Math.round(maxVal * 1.15 * ratio).toLocaleString()}
                </text>
              </g>
            );
          })}

          {/* Base bottom baseline */}
          <line
            x1={paddingX}
            y1={height - paddingY}
            x2={width - paddingX}
            y2={height - paddingY}
            stroke="#e2e8f0"
            strokeWidth="1"
          />

          {/* Filled Area Gradient */}
          {areaPath && <path d={areaPath} fill={metricColor.fill} />}

          {/* Polyline */}
          {pointsString && (
            <polyline
              fill="none"
              stroke={metricColor.stroke}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={pointsString}
            />
          )}

          {/* Interactive Points and Labels */}
          {chartData.map((item, index) => {
            const stepX = (width - paddingX * 2) / (chartData.length - 1 || 1);
            const x = paddingX + index * stepX;
            const normalizedY = 1 - item.value / (maxVal * 1.15 || 1);
            const y = paddingY + normalizedY * (height - paddingY * 2);
            const isHovered = hoveredPoint?.label === item.label;

            return (
              <g key={index}>
                {/* Vertical hover guide bar */}
                {isHovered && (
                  <line
                    x1={x}
                    y1={paddingY}
                    x2={x}
                    y2={height - paddingY}
                    stroke="#cbd5e1"
                    strokeDasharray="2 2"
                    strokeWidth="1"
                  />
                )}

                {/* Point circle */}
                <circle
                  cx={x}
                  cy={y}
                  r={isHovered ? 6 : 4}
                  fill={isHovered ? metricColor.hex : '#ffffff'}
                  stroke={metricColor.stroke}
                  strokeWidth="2.5"
                  className="cursor-pointer transition-all duration-150"
                  onMouseEnter={() => setHoveredPoint({ label: item.label, value: item.value, x, y })}
                />

                {/* X-axis label */}
                <text
                  x={x}
                  y={height - 6}
                  textAnchor="middle"
                  className="text-[10px] fill-slate-500 font-medium select-none"
                >
                  {item.label}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Hover Tooltip Overlay */}
        {hoveredPoint && (
          <div
            className="absolute pointer-events-none transform -translate-x-1/2 -translate-y-full mb-3 bg-slate-900 text-white px-3 py-1.5 rounded-lg shadow-lg text-xs z-10 font-sans"
            style={{
              left: `${(hoveredPoint.x / width) * 100}%`,
              top: `${(hoveredPoint.y / height) * 100}%`,
            }}
          >
            <p className="text-[10px] text-slate-400 font-medium">{hoveredPoint.label}</p>
            <p className="font-mono tabular-nums font-bold text-white text-xs">
              {data.settings.currency} {hoveredPoint.value.toLocaleString()}
            </p>
          </div>
        )}

        {totalPeriod === 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-2xs">
            <div className="text-center p-4 bg-white/95 rounded-xl border border-slate-200/90 shadow-sm max-w-xs">
              <p className="text-xs font-semibold text-slate-700">No transactions recorded</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Complete a sale in the POS terminal or log an entry to populate analytics.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
