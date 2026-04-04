import { useState, useRef, useCallback, useEffect } from 'react'
import {
  Animated,
  Easing,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { designTokens } from '@jait/ui-shared'

/**
 * Voice-first assistant screen for Jait Mobile.
 *
 * Works like Google Assistant / Siri:
 *  - Large pulsing mic button at the bottom
 *  - Tap to start listening → audio is recorded → sent to gateway for STT
 *  - Transcribed text is sent as a chat message
 *  - Response is displayed (and optionally spoken back via TTS)
 *
 * This screen uses the gateway /api/voice/transcribe-audio endpoint
 * so STT runs on the server (Whisper/Wyoming), not on the phone.
 */

export interface VoiceAssistantProps {
  /** Gateway base URL (e.g. "http://192.168.1.5:3000") */
  apiBaseUrl: string
  /** Auth token */
  token: string | null
  /** Session ID for the voice conversation */
  sessionId?: string
  /** STT provider: "whisper" or "wyoming" */
  sttProvider?: 'whisper' | 'wyoming'
}

interface ConversationItem {
  id: string
  role: 'user' | 'assistant'
  text: string
  timestamp: number
}

type ListeningState = 'idle' | 'listening' | 'transcribing' | 'thinking'

export function VoiceAssistant({ apiBaseUrl, token, sessionId = 'mobile-voice', sttProvider: _sttProvider = 'whisper' }: VoiceAssistantProps) {
  const [state, setState] = useState<ListeningState>('idle')
  const [conversation, setConversation] = useState<ConversationItem[]>([])
  const [interimText, setInterimText] = useState('')
  const scrollRef = useRef<ScrollView>(null)

  // Pulsing animation for the mic button
  const pulseAnim = useRef(new Animated.Value(1)).current
  const glowAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (state === 'listening') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.15, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      )
      const glow = Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
          Animated.timing(glowAnim, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        ])
      )
      pulse.start()
      glow.start()
      return () => { pulse.stop(); glow.stop() }
    } else {
      pulseAnim.setValue(1)
      glowAnim.setValue(0)
    }
  }, [state, pulseAnim, glowAnim])

  const addConversationItem = useCallback((role: 'user' | 'assistant', text: string) => {
    setConversation(prev => [...prev, {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      role,
      text,
      timestamp: Date.now(),
    }])
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100)
  }, [])

  const handleMicPress = useCallback(async () => {
    if (!token) return

    if (state === 'listening') {
      // Stop listening — in a real implementation this would stop the audio recorder
      // and send the captured audio to the gateway
      setState('idle')
      return
    }

    setState('listening')
    setInterimText('')

    // In a full implementation, this would:
    // 1. Start native audio recording via expo-av or @react-native-voice/voice
    // 2. On stop, convert to WAV and base64-encode
    // 3. Send to gateway /api/voice/transcribe-audio
    // 4. Then send the transcript as a chat message
    //
    // For now, we demonstrate the flow with a placeholder.
    // The actual recording integration requires the expo-av package:
    //
    //   import { Audio } from 'expo-av'
    //   const recording = new Audio.Recording()
    //   await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY)
    //   await recording.startAsync()
    //   ... user taps stop ...
    //   await recording.stopAndUnloadAsync()
    //   const uri = recording.getURI()
    //   // read file, convert to base64, POST to gateway

  }, [state, token])

  // @ts-expect-error — placeholder for full audio recording integration (requires expo-av)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const sendTranscriptToGateway = useCallback(async (text: string) => {
    if (!token || !text.trim()) return

    addConversationItem('user', text)
    setState('thinking')

    try {
      const res = await fetch(`${apiBaseUrl}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: text,
          sessionId,
          mode: 'agent',
        }),
      })

      if (res.ok) {
        // For SSE streaming, we'd use a streaming reader here.
        // Simplified: read the final response text.
        const data = await res.text()
        const lines = data.split('\n').filter(l => l.startsWith('data: '))
        let assistantText = ''
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line.slice(6))
            if (parsed.content) assistantText += parsed.content
          } catch { /* skip non-JSON lines */ }
        }
        if (assistantText) {
          addConversationItem('assistant', assistantText)
        }
      }
    } catch (err) {
      console.error('Chat error:', err)
    } finally {
      setState('idle')
    }
  }, [addConversationItem, apiBaseUrl, sessionId, token])

  const stateLabel = state === 'listening' ? 'Listening...'
    : state === 'transcribing' ? 'Transcribing...'
    : state === 'thinking' ? 'Thinking...'
    : 'Tap to speak'

  const micColor = state === 'listening' ? '#60a5fa' : state === 'idle' ? '#a78bfa' : '#6b7280'

  const glowRadius = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 20],
  })

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Jait</Text>
        <Text style={styles.headerSubtitle}>Voice Assistant</Text>
      </View>

      {/* Conversation */}
      <ScrollView ref={scrollRef} style={styles.conversationContainer} contentContainerStyle={styles.conversationContent}>
        {conversation.length === 0 && state === 'idle' && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🎤</Text>
            <Text style={styles.emptyTitle}>Hey Jait</Text>
            <Text style={styles.emptySubtitle}>Tap the microphone and ask me anything</Text>
          </View>
        )}
        {conversation.map(item => (
          <View key={item.id} style={[styles.bubble, item.role === 'user' ? styles.userBubble : styles.assistantBubble]}>
            <Text style={[styles.bubbleText, item.role === 'user' ? styles.userBubbleText : styles.assistantBubbleText]}>
              {item.text}
            </Text>
          </View>
        ))}
        {interimText ? (
          <View style={[styles.bubble, styles.userBubble, { opacity: 0.6 }]}>
            <Text style={[styles.bubbleText, styles.userBubbleText]}>{interimText}</Text>
          </View>
        ) : null}
        {state === 'thinking' && (
          <View style={[styles.bubble, styles.assistantBubble]}>
            <Text style={styles.thinkingDots}>● ● ●</Text>
          </View>
        )}
      </ScrollView>

      {/* Mic button area */}
      <View style={styles.micContainer}>
        <Text style={styles.stateLabel}>{stateLabel}</Text>
        <Pressable onPress={handleMicPress} disabled={state === 'transcribing' || state === 'thinking'}>
          <Animated.View
            style={[
              styles.micButton,
              {
                backgroundColor: micColor,
                transform: [{ scale: pulseAnim }],
                shadowColor: micColor,
                shadowRadius: glowRadius as unknown as number,
                shadowOpacity: state === 'listening' ? 0.6 : 0,
              },
            ]}
          >
            <Text style={styles.micIcon}>{state === 'listening' ? '⏹' : '🎤'}</Text>
          </Animated.View>
        </Pressable>
        <Text style={styles.hint}>
          {state === 'idle' ? 'Or say "Hey Jait" to activate' : ''}
        </Text>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: designTokens.color.bg,
  },
  header: {
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2f2f35',
  },
  headerTitle: {
    color: designTokens.color.text,
    fontSize: 24,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: designTokens.color.muted,
    fontSize: 13,
    marginTop: 2,
  },
  conversationContainer: {
    flex: 1,
  },
  conversationContent: {
    padding: 16,
    gap: 12,
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    color: designTokens.color.text,
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptySubtitle: {
    color: designTokens.color.muted,
    fontSize: 16,
    textAlign: 'center',
  },
  bubble: {
    maxWidth: '80%',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#6366f1',
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#2a2a30',
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 22,
  },
  userBubbleText: {
    color: '#ffffff',
  },
  assistantBubbleText: {
    color: designTokens.color.text,
  },
  thinkingDots: {
    color: designTokens.color.muted,
    fontSize: 16,
    letterSpacing: 4,
  },
  micContainer: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingBottom: 40,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2f2f35',
  },
  stateLabel: {
    color: designTokens.color.muted,
    fontSize: 14,
    marginBottom: 16,
  },
  micButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  micIcon: {
    fontSize: 32,
  },
  hint: {
    color: designTokens.color.muted,
    fontSize: 12,
    marginTop: 12,
    opacity: 0.7,
  },
})
