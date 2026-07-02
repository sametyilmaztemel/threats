import { getDailySeverity } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function TrendsPage() {
  const daily = await getDailySeverity();
  const recent = daily.slice(-30);
  const max = Math.max(...recent.map((d: any) => d.total), 1);

  return (
    <div className="max-w-[1400px] mx-auto px-8 py-12">
      <div className="mb-8">
        <div className="text-[10px] tracking-widest2 text-dim mb-1">/TRENDS</div>
        <h1 className="text-3xl font-light tracking-wider2">TIMELINE</h1>
      </div>
      <div className="border border-line p-8">
        <div className="flex items-end gap-px h-64">
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
        <div className="flex gap-6 mt-6 text-[10px] tracking-widest2 text-dim">
          <div className="flex items-center gap-2"><div className="w-3 h-3 bg-crit" />CRITICAL</div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 bg-high" />HIGH</div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 bg-med" />MEDIUM</div>
        </div>
      </div>
    </div>
  );
}
