import { getDailySeverity } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function TrendsPage() {
  const daily = await getDailySeverity();
  const recent = daily.slice(-30);
  const max = Math.max(...recent.map((d: any) => d.total), 1);

  return (
    <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-6 md:py-12">
      <div className="mb-6 md:mb-8">
        <div className="text-[10px] tracking-widest2 text-dim mb-1">/TRENDS</div>
        <h1 className="text-2xl md:text-3xl font-light tracking-wider2">TIMELINE</h1>
      </div>
      <div className="border border-line p-3 md:p-8">
        <div className="flex items-end gap-px h-48 md:h-64">
          {recent.map((d: any) => {
            const total = d.total / max * 100;
            const c = (d.critical / max) * 100;
            const h = (d.high / max) * 100;
            const m = (d.medium / max) * 100;
            return (
              <div key={d.day.toString()} className="flex-1 flex flex-col-reverse group relative" title={`${d.day.toString().slice(0, 10)}: ${d.total}`}>
                <div className="bg-med" style={{ height: `${m}%` }} />
                <div className="bg-high" style={{ height: `${h}%` }} />
                <div className="bg-crit" style={{ height: `${c}%` }} />
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-3 md:gap-6 mt-4 md:mt-6 text-[10px] tracking-widest2 text-dim">
          <div className="flex items-center gap-2"><div className="w-3 h-3 bg-crit" />CRITICAL</div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 bg-high" />HIGH</div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 bg-med" />MEDIUM</div>
        </div>
      </div>
    </div>
  );
}
