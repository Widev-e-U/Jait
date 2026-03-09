import { SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { designTokens } from '@jait/ui-shared';
import { AdaptiveLayout } from './src/components/AdaptiveLayout';
import { BaseCard } from './src/components/BaseCard';
export default function App() {
    return (<SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content"/>
      <AdaptiveLayout sidebar={<BaseCard title="Sessions" subtitle="Hier kommt eure Session-Liste hin."/>} content={<ScrollView contentContainerStyle={styles.contentContainer}>
            <Text style={styles.heading}>Jait Mobile</Text>
            <Text style={styles.subtitle}>
              React-Native-Startpunkt mit denselben Design-Tokens und responsivem Grundlayout.
            </Text>
            <BaseCard title="Chat" subtitle="Bestehende Web-Komponenten werden hier schrittweise nativ umgesetzt."/>
            <BaseCard title="Roadmap" subtitle="1) Basiskomponenten vereinheitlichen 2) Screens migrieren 3) Feature-Parität herstellen">
              <View style={styles.bulletList}>
                <Text style={styles.bullet}>• Shared tokens: fertig</Text>
                <Text style={styles.bullet}>• Adaptive Layout: fertig</Text>
                <Text style={styles.bullet}>• Chat/Jobs/Settings: als nächste Schritte</Text>
              </View>
            </BaseCard>
          </ScrollView>}/>
    </SafeAreaView>);
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
});
//# sourceMappingURL=App.js.map