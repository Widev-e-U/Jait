/**
 * ViewModeSelector — Developer / Manager mode toggle.
 *
 * Placed in the PromptInput bottom bar. Switches the entire UI
 * context between Developer (chat) mode and Manager (automation) mode.
 */
export type ViewMode = 'developer' | 'manager';
interface ViewModeSelectorProps {
    mode: ViewMode;
    onChange: (mode: ViewMode) => void;
    disabled?: boolean;
    className?: string;
}
export declare function ViewModeSelector({ mode, onChange, disabled, className }: ViewModeSelectorProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=view-mode-selector.d.ts.map