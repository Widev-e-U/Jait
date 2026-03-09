/**
 * ViewModeSelector — Developer / Manager mode toggle.
 *
 * Placed in the PromptInput bottom bar. Switches the entire UI
 * context between Developer (chat) mode and Manager (automation) mode.
 */
import { Code, Users, ChevronDown, Check } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
const MODES = [
    {
        value: 'developer',
        label: 'Developer',
        icon: Code,
        description: 'Chat with the AI assistant — ask, plan, and execute',
    },
    {
        value: 'manager',
        label: 'Manager',
        icon: Users,
        description: 'Automation — delegate tasks to agent threads on repos',
    },
];
export function ViewModeSelector({ mode, onChange, disabled, className }) {
    const current = MODES.find((m) => m.value === mode) ?? MODES[0];
    const CurrentIcon = current.icon;
    return (<DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button type="button" className={cn('flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground', 'hover:text-foreground hover:bg-muted/60 transition-colors', 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', 'disabled:pointer-events-none disabled:opacity-50', className)} title={`Mode: ${current.label}`}>
          <CurrentIcon className="h-4 w-4"/>
          <span>{current.label}</span>
          <ChevronDown className="h-3 w-3 opacity-60"/>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-72">
        {MODES.map((m) => {
            const Icon = m.icon;
            const isActive = mode === m.value;
            return (<DropdownMenuItem key={m.value} onClick={() => {
                    // Defer so Radix closes the dropdown (and its FocusScope)
                    // before the parent tree re-renders with a different layout.
                    requestAnimationFrame(() => onChange(m.value));
                }} className="flex items-start gap-2.5 py-2 cursor-pointer">
              <Icon className="h-4 w-4 mt-0.5 shrink-0"/>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{m.label}</div>
                <div className="text-xs text-muted-foreground">{m.description}</div>
              </div>
              {isActive && <Check className="h-4 w-4 mt-0.5 shrink-0 text-primary"/>}
            </DropdownMenuItem>);
        })}
      </DropdownMenuContent>
    </DropdownMenu>);
}
//# sourceMappingURL=view-mode-selector.js.map