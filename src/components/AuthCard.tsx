import React from 'react'
import { StyleSheet, View } from 'react-native'
import { Surface, Text } from 'react-native-paper'
import { LinearGradient } from 'expo-linear-gradient'

type Props = {
  title: string
  subtitle?: string
  children: React.ReactNode
}

export function AuthCard(props: Props) {
  return (
    <Surface style={styles.card} elevation={4}>
      <LinearGradient colors={['#667eea', '#764ba2']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
        <Text variant="headlineSmall" style={styles.title}>
          {props.title}
        </Text>
        {props.subtitle ? (
          <Text variant="bodyMedium" style={styles.subtitle}>
            {props.subtitle}
          </Text>
        ) : null}
      </LinearGradient>
      <View style={styles.content}>{props.children}</View>
    </Surface>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    overflow: 'hidden',
    width: '100%',
    maxWidth: 520,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  header: {
    paddingHorizontal: 18,
    paddingVertical: 18,
    gap: 6,
  },
  title: {
    color: '#fff',
    fontWeight: '700',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.92)',
  },
  content: {
    padding: 18,
    gap: 12,
    backgroundColor: '#fff',
  },
})

