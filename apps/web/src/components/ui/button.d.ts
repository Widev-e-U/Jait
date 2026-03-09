import * as React from "react";
import { type VariantProps } from "class-variance-authority";
declare const buttonVariants: (props?: ({
    variant?: "default" | "link" | "outline" | "secondary" | "ghost" | "destructive" | null | undefined;
    size?: "default" | "icon" | "sm" | "lg" | null | undefined;
} & import("class-variance-authority/types").ClassProp) | undefined) => string;
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
    asChild?: boolean;
    ref?: React.Ref<HTMLButtonElement>;
}
declare function Button({ className, variant, size, asChild, ref, ...props }: ButtonProps): React.JSX.Element;
declare namespace Button {
    var displayName: string;
}
export { Button, buttonVariants };
//# sourceMappingURL=button.d.ts.map