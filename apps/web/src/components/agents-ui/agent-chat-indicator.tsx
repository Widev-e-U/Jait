import { type ComponentProps } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { motion, type MotionProps } from 'motion/react'
import { cn } from '@/lib/utils'

const indicatorVariants = cva('inline-flex rounded-full bg-primary/75 shadow-[0_0_0_0.2rem_hsl(var(--primary)/0.12)]', {
  variants: {
    size: {
      sm: 'h-2.5 w-2.5',
      md: 'h-3.5 w-3.5',
      lg: 'h-5 w-5',
    },
  },
  defaultVariants: {
    size: 'md',
  },
})

export interface AgentChatIndicatorProps
  extends MotionProps,
    Omit<ComponentProps<'span'>, keyof MotionProps>,
    VariantProps<typeof indicatorVariants> {}

export function AgentChatIndicator({
  size,
  className,
  ...props
}: AgentChatIndicatorProps) {
  return (
    <motion.span
      initial={{ opacity: 0.35, scale: 0.82 }}
      animate={{ opacity: [0.45, 1, 0.45], scale: [1, 1.12, 1] }}
      transition={{ duration: 1, ease: 'easeInOut', repeat: Infinity }}
      className={cn(indicatorVariants({ size }), className)}
      {...props}
    />
  )
}
