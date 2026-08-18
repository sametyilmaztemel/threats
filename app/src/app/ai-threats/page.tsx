import type { Metadata } from 'next';
import { getRecentDocuments, getStats } from '@/lib/db';
import DocumentRow from '@/components/DocumentRow';
import { formatNumber } from '@/lib/format';

export const dynamic = 'force-dynamic';


export async function generateMetadata(): Promise<Metadata> { return { title: 'AI-THREATS',
  alternates: { canonical: '/ai-threats' }, openGraph: { url: '/ai-threats', title: 'AI-THREATS' } }; }

export default async function AIThreatsPage({ searchParams }: { searchParams: { cat?: string } }) {
  const cat = searchParams.cat || '';
  const [docs, stats] = await Promise.all([
    getRecentDocuments(50, true, cat),
    getStats()
  ]);

  return (
    <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-6 md:py-12">
      {/* AI hero */}
      <section className="mb-12 md:mb-20 mono-grid -mx-4 md:-mx-8 px-4 md:px-8 py-10 md:py-20 border-b border-line relative overflow-hidden">
        <div className="absolute inset-0 scanline-bg opacity-30" />
        <div className="relative">
          <div className="flex items-center gap-3 text-[10px] tracking-widest2 text-dim mb-4 md:mb-6 flex-wrap">
            <span className="w-1.5 h-1.5 bg-high rounded-full animate-pulse" />
            <span>AI-ADVERSARIAL INTELLIGENCE</span>
          </div>
          <h1 className="text-[40px] sm:text-[60px] md:text-[80px] leading-[0.85] font-extralight tracking-wider2 mb-4 md:mb-6">
            AI<br />
            <span className="font-bold text-high">THREATS</span>
          </h1>
          <p className="text-sm text-dim max-w-2xl leading-relaxed">
            LLM jailbreaks, prompt injection campaigns, model extraction attacks, adversarial ML, deepfake phishing, and malicious model weights.
            Aggregated from MITRE ATLAS, arXiv, AI Incident Database, and security research feeds.
          </p>
        </div>
      </section>

      {/* AI category filter */}
      <section className="mb-10">
        <div className="text-[10px] tracking-widest2 text-dim mb-3">AI THREAT CATEGORY</div>
        <div className="flex gap-2 flex-wrap text-[11px] tracking-widest2">
          <a href="/ai-threats" className={`px-3 py-1 border ${!cat ? 'border-fg text-fg' : 'border-line text-dim hover:text-fg hover:border-fg'}`}>
            ALL
          </a>
          {['research', 'privacy-leak', 'ai-security', 'data-poisoning', 'content-safety', 'autonomous-weapon', 'prompt-injection', 'ai-abuse', 'model-theft'].map(c => (
            <a
              key={c}
              href={`/ai-threats?cat=${c}`}
              className={`px-3 py-1 border ${cat === c ? 'border-fg text-fg' : 'border-line text-dim hover:text-fg hover:border-fg'}`}
            >
              {c.toUpperCase().replace('-', ' ')}
            </a>
          ))}
        </div>
      </section>

      {/* AI-specific stats */}
      <section className="mb-12 md:mb-20">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-line">
          <div className="bg-bg p-3 md:p-6">
            <div className="text-[9px] tracking-widest2 text-dim mb-2 md:mb-3">AI THREATS TRACKED</div>
            <div className="text-2xl md:text-3xl font-light text-high break-words">{formatNumber(stats.ai_threats)}</div>
          </div>
          <div className="bg-bg p-3 md:p-6">
            <div className="text-[9px] tracking-widest2 text-dim mb-2 md:mb-3">MITRE ATLAS ENTRIES</div>
            <div className="text-2xl md:text-3xl font-light">14</div>
          </div>
          <div className="bg-bg p-3 md:p-6">
            <div className="text-[9px] tracking-widest2 text-dim mb-2 md:mb-3">arXiv PAPERS / WEEK</div>
            <div className="text-2xl md:text-3xl font-light">~50</div>
          </div>
          <div className="bg-bg p-3 md:p-6">
            <div className="text-[9px] tracking-widest2 text-dim mb-2 md:mb-3">AI INCIDENTS</div>
            <div className="text-2xl md:text-3xl font-light">600+</div>
          </div>
        </div>
      </section>

      {/* MITRE ATLAS techniques */}
      <section className="mb-12 md:mb-20">
        <div className="text-[10px] tracking-widest2 text-dim mb-4">MITRE ATLAS</div>
        <h2 className="text-xl md:text-2xl font-light tracking-wider2 mb-4 md:mb-6">ADVERSARIAL ML MATRIX</h2>
        <div className="border border-line overflow-x-auto">
          <div className="grid grid-cols-12 text-[10px] tracking-widest2 text-dim border-b border-line bg-panel min-w-[600px]">
            <div className="col-span-2 p-3 md:p-4">ID</div>
            <div className="col-span-6 p-3 md:p-4">NAME</div>
            <div className="col-span-4 p-3 md:p-4">TACTIC</div>
          </div>
          {[
            ['AML.T0051', 'LLM Prompt Injection', 'initial-access'],
            ['AML.T0024', 'Exfiltration via Cyber Means', 'exfiltration'],
            ['AML.T0048', 'Erode ML Model Integrity', 'evasion'],
            ['AML.T0019', 'Publish Poisoned Datasets', 'initial-access'],
            ['AML.T0020', 'Poison Training Data', 'initial-access'],
            ['AML.T0043', 'Craft Adversarial Data', 'evasion'],
            ['AML.T0015', 'Evade ML Model', 'defense-evasion'],
            ['AML.T0028', 'ML Model Inference', 'reconnaissance']
          ].map(([id, name, tactic]) => (
            <div key={id} className="grid grid-cols-12 text-sm border-b border-line hover:bg-panel transition-colors min-w-[600px]">
              <div className="col-span-2 p-3 md:p-4 font-mono text-high text-[11px] break-all">{id}</div>
              <div className="col-span-6 p-3 md:p-4 break-words">{name}</div>
              <div className="col-span-4 p-3 md:p-4 text-dim text-[10px] tracking-widest2">{tactic?.toUpperCase()}</div>
            </div>
          ))}
        </div>
      </section>

      {/* AI Threats feed */}
      <section>
        <div className="text-[10px] tracking-widest2 text-dim mb-4">SIGNAL</div>
        <h2 className="text-xl md:text-2xl font-light tracking-wider2 mb-4 md:mb-6">AI-THREAT EVENTS</h2>
        <div className="border-t border-line">
          {docs.length === 0 ? <div className="p-8 md:p-12 text-center text-dim text-sm">No AI threats ingested yet. The collector is gathering data from MITRE ATLAS, arXiv, and security feeds.</div> : docs.map((d: any) => <DocumentRow key={d.id} doc={d} />)}
        </div>
      </section>
    </div>
  );
}
