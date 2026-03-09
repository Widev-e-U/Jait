export type ChatMode = 'ask' | 'agent' | 'plan';
interface ModeSelectorProps {
    mode: ChatMode;
    onChange: (mode: ChatMode) => void;
    disabled?: boolean;
    className?: string;
}
export declare function ModeSelector({ mode, onChange, disabled, className }: ModeSelectorProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=mode-selector.d.ts.map