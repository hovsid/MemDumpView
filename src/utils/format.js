export function formatSI(n) {
  if (!isFinite(n)) return String(n);
  const abs = Math.abs(n); const sign = n < 0 ? '-' : '';
  if (abs >= 1e9) { const v = abs / 1e9; return sign + (v >= 10 ? Math.round(v) : Math.round(v * 10) / 10) + 'G'; }
  if (abs >= 1e6) { const v = abs / 1e6; return sign + (v >= 10 ? Math.round(v) : Math.round(v * 10) / 10) + 'M'; }
  if (abs >= 1e3) { const v = abs / 1e3; return sign + (v >= 10 ? Math.round(v) : Math.round(v * 10) / 10) + 'k'; }
  if (Math.abs(n - Math.round(n)) < 1e-6) return String(Math.round(n));
  return Number(n).toFixed(2).replace(/\.?0+$/,'');
}
export function formatSeconds(s) {
  if (!isFinite(s)) return String(s);
  if (s >= 3600) { const h = Math.floor(s / 3600); const m = Math.round((s % 3600) / 60); return `${h}h${m > 0 ? m + 'm' : ''}`; }
  if (s >= 60) { const m = Math.floor(s / 60); const ss = Math.round(s % 60); return `${m}m${ss}s`; }
  if (s >= 10) return (Math.round(s * 10) / 10) + 's';
  if (s >= 1) return (Math.round(s * 100) / 100) + 's';
  const ms = Math.round(s * 1000) / 1000; return `${ms}s`;
}