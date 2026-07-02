export interface SearchBarProps {
  defaultValue?: string;
  placeholder?: string;
  autoFocus?: boolean;
}

export default function SearchBar({
  defaultValue = '',
  placeholder = 'Search: +required -excluded "phrase"',
  autoFocus = false,
}: SearchBarProps) {
  return (
    <form action="/feed" method="GET" className="w-full">
      <div className="flex items-stretch border border-line bg-bg-2 focus-within:border-fg transition-colors">
        <input
          type="text"
          name="q"
          defaultValue={defaultValue}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck={false}
          className="flex-1 min-w-0 px-3 py-2 bg-transparent text-fg font-mono text-[13px] placeholder:text-dim focus:outline-none"
        />
        <button
          type="submit"
          className="px-4 py-2 border-l border-line text-[10px] font-mono tracking-widest2 text-fg hover:bg-fg hover:text-bg transition-colors"
        >
          SEARCH
        </button>
      </div>
      <div className="mt-1 text-[9px] tracking-widest2 text-dim font-mono">
        SYNTAX: <span className="text-fg">+required</span> <span className="text-fg">-excluded</span> <span className="text-fg">&quot;phrase&quot;</span> <span className="text-fg">actor:conti</span> <span className="text-fg">cve:CVE-2024-*</span>
      </div>
    </form>
  );
}