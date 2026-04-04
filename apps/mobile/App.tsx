import { useState, useEffect } from 'react'
import { SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, View, Pressable } from 'react-native'
import { designTokens } from '@jait/ui-shared'
import { AdaptiveLayout } from './src/components/AdaptiveLayout'
import { BaseCard } from './src/components/BaseCard'
import { VoiceAssistant } from './src/components/VoiceAssistant'
import { bootstrapMobileClient } from './src/mobile-bootstrap'

type Screen = 'home' | 'assistant'

export default function App() {
  const [screen, setScreen] = useState<Screen>('assistant')
  const [apiBaseUrl, setApiBaseUrl] = useState<string | null>(null)
  const [token] = useState<string | null>(null) // TODO: wire up auth flow

  // Auto-discover gateway on launch
  useEffect(() => {
    const gatewayUrl = 'http://192.168.178.60:1337' // TODO: make configurable / use discovery
    bootstrapMobileClient(gatewayUrl)
      .then(result => setApiBaseUrl(result.apiBaseUrl))
      .catch(err => console.warn('Gateway discovery failed:', err))
  }, [])

  if (screen === 'assistant' && apiBaseUrl) {
    return (
      <VoiceAssistant
        apiBaseUrl={apiBaseUrl}
        token={token}
        sttProvider="whisper"
      />
    )
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <AdaptiveLayout
        sidebar={<BaseCard title="Sessions" subtitle="Hier kommt eure Session-Liste hin." />}
        content={
          <ScrollView contentContainerStyle={styles.contentContainer}>
            <Text style={styles.heading}>Jait Mobile</Text>
            <Text style={styles.subtitle}>
              React-Native-Startpunkt mit denselben Design-Tokens und responsivem Grundlayout.
            </Text>

            <Pressable onPress={() => setScreen('assistant')}>
              <BaseCard title="🎤 Voice Assistant" subtitle="Tap to open the voice assistant — say 'Hey Jait' to activate hands-free." />
            </Pressable>

            <BaseCard title="Chat" subtitle="Bestehende Web-Komponenten werden hier schrittweise nativ umgesetzt." />
            <BaseCard title="Roadmap" subtitle="1) Basiskomponenten vereinheitlichen 2) Screens migrieren 3) Feature-Parität herstellen">
              <View style={styles.bulletList}>
                <Text style={styles.bullet}>• Shared tokens: fertig</Text>
                <Text style={styles.bullet}>• Adaptive Layout: fertig</Text>
                <Text style={styles.bullet}>• Voice Assistant: fertig</Text>
                <Text style={styles.bullet}>• Chat/Jobs/Settings: als nächste Schritte</Text>
              </View>
            </BaseCard>
          </ScrollView>
        }
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: designTokens.color.bg,
  },
  contentContainer: {
    gap: 12,
    padding: 16,
  },
  heading: {
    color: designTokens.color.text,
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    color: designTokens.color.muted,
    fontSize: 14,
  },
  bulletList: {
    gap: 6,
  },
  bullet: {
    color: designTokens.color.text,
    fontSize: 14,
  },
})
