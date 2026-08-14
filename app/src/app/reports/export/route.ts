import { NextRequest, NextResponse } from 'next/server';
import PDFDocument from 'pdfkit';
import { getStats, getReportSectorSummary, getReportActorTimeline, getReportKillChain, getReportSourceHealth, getReportTopIOCs } from '@/lib/db';

export const dynamic = 'force-dynamic';

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '—';
  return date.toISOString().split('T')[0];
}

export async function GET(req: NextRequest) {
  const daysParam = req.nextUrl.searchParams.get('days') || '30';

  const [stats, sectors, actorTimeline, killChain, sources, topIocs] = await Promise.all([
    getStats(),
    getReportSectorSummary(12),
    getReportActorTimeline(90),
    getReportKillChain(),
    getReportSourceHealth(),
    getReportTopIOCs(undefined, 25),
  ]);

  // Actor son 30 gün
  const last30 = actorTimeline.filter((t: any) => {
    const d = new Date(t.day);
    return d >= new Date(Date.now() - 30 * 86400_000);
  });
  const actorTotals: Record<string, number> = {};
  for (const t of last30) actorTotals[t.actor] = (actorTotals[t.actor] || 0) + Number(t.doc_count);
  const topActors = Object.entries(actorTotals).sort((a, b) => b[1] - a[1]).slice(0, 8);

  const activeSources = sources.filter((s: any) => s.enabled);
  const healthySources = activeSources.filter((s: any) => !s.last_status || s.last_status === 'ok');

  // ── PDF oluştur ──
  const doc = new PDFDocument({ size: 'A4', margins: { top: 48, bottom: 48, left: 48, right: 48 } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));

  const done = new Promise<void>((resolve) => doc.on('end', resolve));

  const now = new Date();
  const month = now.toLocaleString('en-US', { month: 'long', year: 'numeric' });

  // Header
  doc.fontSize(8).fillColor('#666').text('THREATS.0RCE.COM — INTELLIGENCE REPORT', { align: 'left' });
  doc.fillColor('#666').text(`GENERATED ${now.toISOString().split('T')[0]} · TLP:GREEN`, { align: 'right' });
  doc.moveDown(1.5);

  doc.fontSize(22).fillColor('#000').text('0RCE Threat Intelligence', { align: 'center' });
  doc.fontSize(13).fillColor('#333').text(`Monthly Report — ${month}`, { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(9).fillColor('#666')
    .text(`${stats.total_documents} documents · ${stats.total_iocs} IOCs · ${stats.ai_threats} AI threats · ${activeSources.length} active sources`, { align: 'center' });
  doc.moveDown(1.5);

  // Exec summary
  doc.fontSize(11).fillColor('#000').text('Executive Summary', { underline: true });
  doc.moveDown(0.4);
  doc.fontSize(9).fillColor('#333')
    .text(`This report aggregates intelligence from ${activeSources.length} public sources (${healthySources.length} healthy) over the reporting period. `)
    .text(`A total of ${stats.total_documents} documents were ingested, referencing ${stats.total_iocs} indicators of compromise. `)
    .text(`${stats.ai_threats} documents were classified as AI-related threats. `)
    .text(`Top threat actors by activity: ${topActors.slice(0,3).map(([a,c]) => `${a} (${c})`).join(', ') || 'n/a'}.`);
  doc.moveDown(1.2);

  // Sector exposure
  doc.fontSize(11).fillColor('#000').text('Sector Exposure', { underline: true });
  doc.moveDown(0.4);
  if (sectors.length === 0) {
    doc.fontSize(9).fillColor('#333').text('No sector data.');
  } else {
    sectors.forEach((s: any) => {
      doc.fontSize(9).fillColor('#333')
        .text(`${String(s.sector).toUpperCase().padEnd(16)}  ${s.doc_count} docs  (${s.critical} critical)`);
    });
  }
  doc.moveDown(1.2);

  // Actor activity
  doc.fontSize(11).fillColor('#000').text('Actor Activity (last 30 days)', { underline: true });
  doc.moveDown(0.4);
  if (topActors.length === 0) {
    doc.fontSize(9).fillColor('#333').text('No actor activity.');
  } else {
    topActors.forEach(([actor, count]) => {
      doc.fontSize(9).fillColor('#333').text(`${actor.padEnd(24)}  ${count} mentions`);
    });
  }
  doc.moveDown(1.2);

  // Kill chain
  doc.fontSize(11).fillColor('#000').text('Kill Chain Distribution', { underline: true });
  doc.moveDown(0.4);
  if (killChain.length === 0) {
    doc.fontSize(9).fillColor('#333').text('No kill-chain data.');
  } else {
    killChain.forEach((k: any) => {
      doc.fontSize(9).fillColor('#333')
        .text(`${String(k.phase).toUpperCase().padEnd(16)}  ${k.doc_count} docs`);
    });
  }
  doc.moveDown(1.2);

  // Top IOCs
  doc.fontSize(11).fillColor('#000').text('Most Referenced IOCs', { underline: true });
  doc.moveDown(0.4);
  if (topIocs.length === 0) {
    doc.fontSize(9).fillColor('#333').text('No IOC data.');
  } else {
    topIocs.slice(0, 15).forEach((i: any) => {
      doc.fontSize(8).fillColor('#333')
        .text(`${String(i.value).slice(0, 45).padEnd(46)}  ${String(i.type).toUpperCase().padEnd(10)}  ${i.doc_mentions} mentions`);
    });
  }
  doc.moveDown(1.2);

  // Source health
  doc.fontSize(11).fillColor('#000').text('Source Health', { underline: true });
  doc.moveDown(0.4);
  activeSources.slice(0, 20).forEach((s: any) => {
    const status = s.last_status && s.last_status !== 'ok' ? '⚠' : 'OK';
    doc.fontSize(8).fillColor('#333')
      .text(`${String(s.name).slice(0, 32).padEnd(34)}  ${String(s.category).toUpperCase().padEnd(10)}  ${s.docs_ingested || 0} docs  ${status}`);
  });
  doc.moveDown(1.5);

  // Footer
  doc.fontSize(7).fillColor('#999')
    .text('All data aggregated from public sources. Distribution: TLP:GREEN.', { align: 'center' });

  doc.end();
  await done;

  const pdf = Buffer.concat(chunks);
  return new NextResponse(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="threats-report-${now.toISOString().split('T')[0]}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
