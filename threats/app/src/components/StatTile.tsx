export default function StatTile({ label, value, accent }: { label: string; value: string; accent?: 'crit' | 'high' | 'med' | 'low' }) {
  const accentClass = accent === 'crit' ? 'text-crit' : accent === 'high' ? 'text-high' : accent === 'med' ? 'text-med' : accent === 'low' ? 'text-low' : '';
  return (
    <div className="bg-bg p-3 md:p-5 lg:p-6 hover:bg-panel transition-colors group">
      <div className="text-[9px] md:text-[10px] tracking-widest2 text-dim mb-2 md:mb-3">{label}</div>
      <div className={`text-xl md:text-3xl font-light tracking-wider2 ${accentClass} group-hover:scale-[1.02] transition-transform break-words`}>{value}</div>
    </div>
  );
}
