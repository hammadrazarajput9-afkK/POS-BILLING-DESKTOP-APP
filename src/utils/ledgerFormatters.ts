export function getInitials(name: string): string {
  const clean = (name || '').trim();
  if (!clean) return 'PT';
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase();
}

export function formatLedgerTimestamp(isoDate?: string, relativeDay = false): string {
  if (!isoDate) return '';
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return '';

  const timeStr = d.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  if (relativeDay) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const dStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const diffDays = Math.round((todayStart - dStart) / 86400000);
    if (diffDays === 0) return `Today · ${timeStr}`;
    if (diffDays === 1) return `Yesterday · ${timeStr}`;
  }

  const weekday = d.toLocaleDateString('en-US', { weekday: 'short' });
  const day = String(d.getDate()).padStart(2, '0');
  const month = d.toLocaleDateString('en-US', { month: 'short' });
  const year = String(d.getFullYear()).slice(-2);
  return `${weekday}, ${day} ${month} ${year} · ${timeStr}`;
}

export function cleanWhatsAppPhone(phone?: string): string {
  const digits = (phone || '').replace(/[^0-9]/g, '');
  if (!digits) return '';
  return digits.startsWith('0') ? `92${digits.substring(1)}` : digits;
}

/**
 * Safe mathematical expression evaluator for the Khata calculator keypad (+, -, ×, ÷, %)
 * Supports chained operations with standard operator precedence, without eval().
 */
export function evaluateCalculatorExpression(rawExpr: string): number {
  const expr = (rawExpr || '')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/,/g, '')
    .trim();

  if (!expr) return 0;

  // Tokenize numbers and operators
  const tokens: Array<number | string> = [];
  let current = '';

  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if ((ch >= '0' && ch <= '9') || ch === '.') {
      current += ch;
    } else if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      if (current === '' && ch === '-' && tokens.length === 0) {
        current = '-';
      } else {
        if (current !== '') {
          const parsed = Number(current);
          if (!Number.isFinite(parsed)) return 0;
          tokens.push(parsed);
          current = '';
        }
        // Replace trailing operator if consecutive operators typed
        if (typeof tokens[tokens.length - 1] === 'string') {
          tokens[tokens.length - 1] = ch;
        } else if (tokens.length > 0) {
          tokens.push(ch);
        }
      }
    } else if (ch === '%') {
      if (current !== '') {
        const parsed = Number(current);
        if (!Number.isFinite(parsed)) return 0;
        tokens.push(parsed / 100);
        current = '';
      }
    }
  }

  if (current !== '' && current !== '-') {
    const parsed = Number(current);
    if (!Number.isFinite(parsed)) return 0;
    tokens.push(parsed);
  }

  // Strip trailing operator
  if (tokens.length > 0 && typeof tokens[tokens.length - 1] === 'string') {
    tokens.pop();
  }

  if (tokens.length === 0) return 0;

  // Pass 1: * and /
  const pass1: Array<number | string> = [tokens[0]];
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i] as string;
    const rhs = tokens[i + 1] as number;
    if (rhs === undefined) break;
    if (op === '*' || op === '/') {
      const lhs = pass1.pop() as number;
      pass1.push(op === '*' ? lhs * rhs : rhs === 0 ? 0 : lhs / rhs);
    } else {
      pass1.push(op, rhs);
    }
  }

  // Pass 2: + and -
  let total = pass1[0] as number;
  for (let i = 1; i < pass1.length; i += 2) {
    const op = pass1[i] as string;
    const rhs = pass1[i + 1] as number;
    if (rhs === undefined) break;
    if (op === '+') total += rhs;
    else if (op === '-') total -= rhs;
  }

  return Number.isFinite(total) ? Math.round(total * 100) / 100 : 0;
}
