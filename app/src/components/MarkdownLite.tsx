'use client';

// MarkdownLite — minimal, güvenli Markdown render (Madde 10).
// Başlık, liste, link, kod bloğu, bold, italic, code, line break.
// HTML escape; link rel="noopener noreferrer"; raw HTML YOK.

import React from 'react';

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] || ch));
}

function renderInline(s: string): string {
  // bold **...**, italic *...*, code `...`, link [text](url)
  let out = escapeHtml(s);
  out = out.replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 bg-panel border border-line text-[11px] font-mono break-all">$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-fg">$1</strong>');
  out = out.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em class="italic">$1</em>');
  // link — javascript:, data:, vbscript: YOK
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, t, u) => {
    const safe = /^(https?:|mailto:|\/)/i.test(u) ? u : '#';
    return `<a href="${safe}" rel="noopener noreferrer" target="_blank" class="underline text-high hover:text-fg">${t}</a>`;
  });
  return out;
}

export function MarkdownLite({ text }: { text: string }) {
  if (!text) return null;
  const lines = text.split(/\r?\n/);
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^###\s+/.test(line)) {
      blocks.push(<h3 key={key++} className="text-base font-semibold text-fg mt-4 mb-2">{renderInline(line.replace(/^###\s+/, ''))}</h3>);
      i++;
    } else if (/^##\s+/.test(line)) {
      blocks.push(<h2 key={key++} className="text-lg font-semibold text-fg mt-5 mb-3">{renderInline(line.replace(/^##\s+/, ''))}</h2>);
      i++;
    } else if (/^#\s+/.test(line)) {
      blocks.push(<h1 key={key++} className="text-xl font-semibold text-fg mt-6 mb-3">{renderInline(line.replace(/^#\s+/, ''))}</h1>);
      i++;
    } else if (/^\s*-\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*-\s+/, ''));
        i++;
      }
      blocks.push(<ul key={key++} className="list-disc list-inside text-sm text-fg mb-3 space-y-1">{items.map((it, idx) => <li key={idx} dangerouslySetInnerHTML={{ __html: renderInline(it) }} />)}</ul>);
    } else if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      blocks.push(<ol key={key++} className="list-decimal list-inside text-sm text-fg mb-3 space-y-1">{items.map((it, idx) => <li key={idx} dangerouslySetInnerHTML={{ __html: renderInline(it) }} />)}</ol>);
    } else if (/^```/.test(line)) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) { codeLines.push(lines[i]); i++; }
      i++;
      blocks.push(<pre key={key++} className="bg-panel border border-line p-3 my-3 overflow-x-auto text-[11px] font-mono whitespace-pre-wrap break-words"><code>{codeLines.join('\n')}</code></pre>);
    } else if (line.trim() === '') {
      i++;
    } else {
      // paragraf (boş satıra kadar birleştir)
      const para: string[] = [line];
      i++;
      while (i < lines.length && lines[i].trim() !== '' && !/^[#\s\-\d]/.test(lines[i])) {
        para.push(lines[i]); i++;
      }
      blocks.push(<p key={key++} className="text-sm text-fg leading-relaxed mb-3 break-words" dangerouslySetInnerHTML={{ __html: renderInline(para.join(' ')) }} />);
    }
  }
  return <div className="markdown-lite">{blocks}</div>;
}

export function PlainText({ text }: { text: string }) {
  if (!text) return null;
  // escape + paragraflama (markdown yok)
  const paras = text.split(/\n{2,}/);
  return (
    <div className="plain-text">
      {paras.map((p, idx) => (
        <p key={idx} className="text-sm text-fg leading-relaxed mb-3 break-words" dangerouslySetInnerHTML={{ __html: escapeHtml(p).replace(/\n/g, '<br/>') }} />
      ))}
    </div>
  );
}
