import { getGraphData } from '@/lib/db';
import GraphView from '@/components/GraphView';

export const dynamic = 'force-dynamic';
export const revalidate = 3600; // 1 saat cache

export default async function GraphPage() {
  const { nodes, edges } = await getGraphData();
  return (
    <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-6 md:py-12">
      <div className="mb-6 md:mb-8">
        <div className="text-[10px] tracking-widest2 text-dim mb-1">/GRAPH</div>
        <h1 className="text-2xl md:text-3xl font-light tracking-wider2">KNOWLEDGE GRAPH</h1>
        <p className="text-xs text-dim mt-2 break-words">
          {nodes.length} nodes · {edges.length} edges · high-confidence actor↔technique links
        </p>
      </div>
      {nodes.length === 0 ? (
        <div className="border border-line p-4 md:p-8 min-h-[400px] md:min-h-[600px] flex items-center justify-center">
          <div className="text-center text-dim text-sm">No graph data yet.</div>
        </div>
      ) : (
        <GraphView nodes={nodes} edges={edges} />
      )}
    </div>
  );
}
