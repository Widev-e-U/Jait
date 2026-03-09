import { useCallback, useEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { X, Trash2, ArrowDown, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
/**
 * Global SSE debug log — useChat pushes events here, the panel reads them.
 * Kept outside React to avoid rerenders on every event.
 */
const MAX_EVENTS = 5_000;
let _nextId = 0;
let _events = [];
let _listeners = new Set();
export function pushSSEDebugEvent(type, raw) {
    _events.push({ id: _nextId++, ts: Date.now(), type, raw });
    if (_events.length > MAX_EVENTS)
        _events = _events.slice(-MAX_EVENTS);
    _listeners.forEach(fn => fn());
}
export function clearSSEDebugEvents() {
    _events = [];
    _listeners.forEach(fn => fn());
}
function useSSEDebugEvents() {
    const [, setTick] = useState(0);
    useEffect(() => {
        const listener = () => setTick(t => t + 1);
        _listeners.add(listener);
        return () => { _listeners.delete(listener); };
    }, []);
    return _events;
}
const typeColors = {
    request: 'text-orange-400',
    token: 'text-gray-400',
    tool_call_delta: 'text-blue-400',
    tool_start: 'text-yellow-400',
    tool_output: 'text-green-400',
    tool_result: 'text-emerald-400',
    thinking: 'text-purple-400',
    done: 'text-gray-500',
    error: 'text-red-400',
};
const ROW_HEIGHT = 20;
export function SSEDebugPanel({ onClose }) {
    const events = useSSEDebugEvents();
    const scrollRef = useRef(null);
    const [autoScroll, setAutoScroll] = useState(true);
    const [filter, setFilter] = useState('');
    const [copied, setCopied] = useState(false);
    const [expanded, setExpanded] = useState(new Set());
    const toggleExpand = useCallback((eventId) => {
        setExpanded(prev => {
            const next = new Set(prev);
            if (next.has(eventId))
                next.delete(eventId);
            else
                next.add(eventId);
            return next;
        });
    }, []);
    const filtered = filter
        ? events.filter(e => e.type.includes(filter) || e.raw.includes(filter))
        : events;
    const virtualizer = useVirtualizer({
        count: filtered.length,
        getScrollElement: () => scrollRef.current,
        estimateSize: () => ROW_HEIGHT,
        overscan: 30,
    });
    const handleCopy = () => {
        const text = filtered
            .map(e => `${new Date(e.ts).toISOString().slice(11, 23)} ${e.type} ${e.raw}`)
            .join('\n');
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };
    // Auto-scroll to bottom when new events arrive
    useEffect(() => {
        if (autoScroll && filtered.length > 0) {
            virtualizer.scrollToIndex(filtered.length - 1, { align: 'end' });
        }
    }, [filtered.length, autoScroll]);
    const handleScroll = useCallback(() => {
        const el = scrollRef.current;
        if (!el)
            return;
        const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        setAutoScroll(atBottom);
    }, []);
    return (<div className="flex flex-col h-full bg-[#0d1117] text-[#c9d1d9] text-xs font-mono">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-700/60 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">SSE Debug</span>
          <span className="text-[10px] text-zinc-500">{filtered.length}/{events.length}</span>
        </div>
        <div className="flex items-center gap-1">
          <input type="text" placeholder="Filter..." value={filter} onChange={e => setFilter(e.target.value)} className="h-5 w-28 px-1.5 text-[10px] rounded bg-zinc-800 border border-zinc-700 text-zinc-300 placeholder-zinc-500 focus:outline-none focus:border-blue-500"/>
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={handleCopy} title="Copy all events">
            {copied ? <Check className="h-3 w-3 text-green-400"/> : <Copy className="h-3 w-3"/>}
          </Button>
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={clearSSEDebugEvents}>
            <Trash2 className="h-3 w-3"/>
          </Button>
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={onClose}>
            <X className="h-3 w-3"/>
          </Button>
        </div>
      </div>

      {/* Virtualized event stream */}
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto overflow-x-hidden">
        <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }}>
          {virtualizer.getVirtualItems().map(virtualRow => {
            const ev = filtered[virtualRow.index];
            const time = new Date(ev.ts).toISOString().slice(11, 23);
            const color = typeColors[ev.type] ?? 'text-zinc-400';
            const isLong = ev.raw.length > 120;
            const isExpanded = expanded.has(ev.id);
            const display = isLong && !isExpanded ? ev.raw.slice(0, 120) + '…' : ev.raw;
            return (<div key={ev.id} data-index={virtualRow.index} ref={virtualizer.measureElement} style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                }} className={cn('flex gap-2 px-2 hover:bg-zinc-800/50 leading-tight cursor-pointer select-none', isExpanded ? 'items-start py-1 bg-zinc-800/30' : 'items-center')} onClick={() => toggleExpand(ev.id)}>
                <span className="text-zinc-600 shrink-0 w-20" style={{ minHeight: ROW_HEIGHT }}>{time}</span>
                <span className={cn('shrink-0 w-28 text-right', color)} style={{ minHeight: ROW_HEIGHT }}>{ev.type}</span>
                <span className={cn('text-zinc-400 min-w-0', isExpanded ? 'break-all whitespace-pre-wrap' : 'truncate')}>
                  {display}
                  {isLong && !isExpanded && <span className="text-zinc-600 ml-1">▸</span>}
                </span>
              </div>);
        })}
        </div>
      </div>

      {/* Scroll-to-bottom indicator */}
      {!autoScroll && (<div className="absolute bottom-2 right-4">
          <Button variant="outline" size="icon" className="h-6 w-6 rounded-full bg-zinc-800 border-zinc-600" onClick={() => {
                setAutoScroll(true);
                virtualizer.scrollToIndex(filtered.length - 1, { align: 'end' });
            }}>
            <ArrowDown className="h-3 w-3"/>
          </Button>
        </div>)}
    </div>);
}
//# sourceMappingURL=sse-debug-panel.js.map