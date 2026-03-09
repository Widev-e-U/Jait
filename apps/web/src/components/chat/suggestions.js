import { cn } from '@/lib/utils';
export function Suggestions({ suggestions, onSelect, className }) {
    return (<div className={cn('flex flex-wrap gap-2 justify-center', className)}>
      {suggestions.map((suggestion) => (<button key={suggestion} onClick={() => onSelect(suggestion)} className="px-4 py-2 text-sm rounded-full border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors">
          {suggestion}
        </button>))}
    </div>);
}
//# sourceMappingURL=suggestions.js.map