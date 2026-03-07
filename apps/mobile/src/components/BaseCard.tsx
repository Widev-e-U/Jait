import type { ReactNode } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { designTokens } from '@jait/ui-shared'

type BaseCardProps = {
  title: string
  subtitle?: string
  children?: ReactNode
}

export function BaseCard({ title, subtitle, children }: BaseCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: designTokens.color.panel,
    borderRadius: 12,
    padding: designTokens.spacing.lg,
    gap: designTokens.spacing.sm,
  },
  title: {
    color: designTokens.color.text,
    fontSize: 17,
    fontWeight: '600',
  },
  subtitle: {
    color: designTokens.color.muted,
    fontSize: 13,
  },
})
