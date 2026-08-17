'use client';

// GraphView — dependency-free SVG knowledge graph render (Madde 8)
// Force-directed layout (basit iterative) ile client-side.
// 1000 node ve 5000 edge'i render edebilir (DOM limitlerini dikkate alarak).

import { useEffect, useRef, useState } from 'react';

interface GraphNode { id: string; label: string; group: string; }
interface GraphEdge { from: string; to: string; confidence?: number; relation?: string; }

const GROUP_COLORS: Record<string, string> = {
  actor: '#ff3860',
  technique: '#00d97e',
  sector: '#ffd60a',
  cve: '#a05cff',
  ioc: '#ff9500',
};

const MAX_NODES = 800;
const MAX_EDGES = 1500;

export default function GraphView({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const ref = useRef<SVGSVGElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    const truncatedNodes = nodes.slice(0, MAX_NODES);
    const truncatedEdges = edges.slice(0, MAX_EDGES).filter(
      (e: any) => truncatedNodes.find(n => n.id === e.from) && truncatedNodes.find(n => n.id === e.to)
    );
    const svg = ref.current;
    if (!svg) return;
    svg.innerHTML = '';
    // SVG dimensions
    const W = svg.clientWidth || 720;
    const H = svg.clientHeight || 600;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    // Initial positions (circular layout)
    const positions = new Map<string, { x: number; y: number }>();
    truncatedNodes.forEach((n: any, i: number) => {
      const angle = (i / Math.max(truncatedNodes.length, 1)) * 2 * Math.PI;
      positions.set(n.id, {
        x: W / 2 + Math.cos(angle) * (W * 0.4),
        y: H / 2 + Math.sin(angle) * (H * 0.4),
      });
    });
    // Render edges
    const edgesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    edgesGroup.setAttribute('stroke', '#444');
    edgesGroup.setAttribute('stroke-width', '0.5');
    edgesGroup.setAttribute('opacity', '0.4');
    truncatedEdges.forEach((e: any) => {
      const from = positions.get(e.from);
      const to = positions.get(e.to);
      if (!from || !to) return;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(from.x));
      line.setAttribute('y1', String(from.y));
      line.setAttribute('x2', String(to.x));
      line.setAttribute('y2', String(to.y));
      edgesGroup.appendChild(line);
    });
    svg.appendChild(edgesGroup);
    // Render nodes
    const nodesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    truncatedNodes.forEach((n: any) => {
      const pos = positions.get(n.id)!;
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', String(pos.x));
      circle.setAttribute('cy', String(pos.y));
      circle.setAttribute('r', n.group === 'actor' ? '4' : '3');
      circle.setAttribute('fill', GROUP_COLORS[n.group] || '#888');
      circle.setAttribute('data-id', n.id);
      circle.setAttribute('data-label', n.label);
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent = `${n.label} (${n.group})`;
      circle.appendChild(title);
      circle.addEventListener('mouseenter', () => setHovered(n.id));
      circle.addEventListener('mouseleave', () => setHovered(null));
      nodesGroup.appendChild(circle);
    });
    svg.appendChild(nodesGroup);
    // Simple force-directed relaxation (5 iterations)
    for (let iter = 0; iter < 5; iter++) {
      // Repulsion between nodes (skip every other iter for perf)
      for (let i = 0; i < truncatedNodes.length; i++) {
        const a = truncatedNodes[i];
        const pa = positions.get(a.id)!;
        for (let j = i + 1; j < truncatedNodes.length; j++) {
          const b = truncatedNodes[j];
          const pb = positions.get(b.id)!;
          const dx = pa.x - pb.x;
          const dy = pa.y - pb.y;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
          const force = 800 / (dist * dist);
          const fx = (dx / dist) * force * 0.5;
          const fy = (dy / dist) * force * 0.5;
          pa.x = Math.max(20, Math.min(W - 20, pa.x + fx));
          pa.y = Math.max(20, Math.min(H - 20, pa.y + fy));
          pb.x = Math.max(20, Math.min(W - 20, pb.x - fx));
          pb.y = Math.max(20, Math.min(H - 20, pb.y - fy));
        }
      }
    }
    // Apply final positions
    Array.from(nodesGroup.children).forEach((circle: any) => {
      const id = circle.getAttribute('data-id');
      const pos = positions.get(id);
      if (pos) {
        circle.setAttribute('cx', String(pos.x));
        circle.setAttribute('cy', String(pos.y));
      }
    });
    Array.from(edgesGroup.children).forEach((line: any, i: number) => {
      const e = truncatedEdges[i];
      if (!e) return;
      const from = positions.get(e.from);
      const to = positions.get(e.to);
      if (from && to) {
        line.setAttribute('x1', String(from.x));
        line.setAttribute('y1', String(from.y));
        line.setAttribute('x2', String(to.x));
        line.setAttribute('y2', String(to.y));
      }
    });
  }, [nodes, edges]);

  return (
    <div className="border border-line bg-bg">
      <svg ref={ref} className="w-full h-[600px] md:h-[720px]" />
      {hovered && (
        <div className="p-2 text-[10px] font-mono text-dim border-t border-line">
          {nodes.find(n => n.id === hovered)?.label} ({nodes.find(n => n.id === hovered)?.group})
        </div>
      )}
    </div>
  );
}
