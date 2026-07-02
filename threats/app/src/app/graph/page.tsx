import { getGraphData } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function GraphPage() {
  const { nodes, edges } = await getGraphData();
  return (
    <div className="max-w-[1400px] mx-auto px-8 py-12">
      <div className="mb-8">
        <div className="text-[10px] tracking-widest2 text-dim mb-1">/GRAPH</div>
        <h1 className="text-3xl font-light tracking-wider2">KNOWLEDGE GRAPH</h1>
        <p className="text-xs text-dim mt-2">{nodes.length} nodes · {edges.length} edges</p>
      </div>
      <div className="border border-line p-8 min-h-[600px] flex items-center justify-center">
        <div className="text-center text-dim text-sm">
          <div className="mb-2 text-fg">GRAPH VIEW</div>
          <div className="text-xs">vis-network integration pending. {nodes.length} actors/sectors/techniques loaded.</div>
        </div>
      </div>
    </div>
  );
}
