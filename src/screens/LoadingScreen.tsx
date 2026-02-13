import React from 'react'
import { View } from 'react-native'
import { ActivityIndicator, Text } from 'react-native-paper'

export function LoadingScreen() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 16 }}>
      <ActivityIndicator animating size="large" />
      <Text variant="bodyMedium">Loading…</Text>
    </View>
  )
}

