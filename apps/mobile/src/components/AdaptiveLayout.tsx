import type { ReactNode } from 'react'
import { useWindowDimensions, View, StyleSheet } from 'react-native'

type AdaptiveLayoutProps = {
  sidebar?: ReactNode
  content: ReactNode
}

export function AdaptiveLayout({ sidebar, content }: AdaptiveLayoutProps) {
  const { width } = useWindowDimensions()
  const isTablet = width >= 900

  if (!isTablet) {
    return <View style={styles.mobileContainer}>{content}</View>
  }

  return (
    <View style={styles.tabletContainer}>
      {sidebar ? <View style={styles.sidebar}>{sidebar}</View> : null}
      <View style={styles.content}>{content}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  mobileContainer: {
    flex: 1,
  },
  tabletContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  sidebar: {
    width: 280,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: '#2f2f35',
    padding: 16,
  },
  content: {
    flex: 1,
    padding: 16,
  },
})
