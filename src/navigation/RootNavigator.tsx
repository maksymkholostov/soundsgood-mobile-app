import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'

import type { RootStackParamList } from './types'
import { MainTabs } from './MainTabs'
import { AuthStack } from './AuthStack'
import { LoadingScreen } from '../screens/LoadingScreen'
import { SoundClassDetailScreen } from '../screens/SoundClassDetailScreen'
import { useAppDispatch, useAppSelector } from '../store/hooks'
import { bootstrapSettings } from '../store/slices/settingsSlice'
import { bootstrapAuth } from '../store/slices/authSlice'

const Stack = createNativeStackNavigator<RootStackParamList>()

export function RootNavigator() {
  const dispatch = useAppDispatch()
  const auth = useAppSelector((s) => s.auth)
  const settings = useAppSelector((s) => s.settings)

  React.useEffect(() => {
    const run = async () => {
      try {
        await dispatch(bootstrapSettings())
      } finally {
        await dispatch(bootstrapAuth())
      }
    }
    void run()
  }, [dispatch])

  if (!settings.isLoaded || !auth.isLoaded) {
    return <LoadingScreen />
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {auth.isAuthenticated ? (
        <>
          <Stack.Screen name="MainTabs" component={MainTabs} />
          <Stack.Screen
            name="SoundClassDetail"
            component={SoundClassDetailScreen}
            options={{ headerShown: true, title: 'Sound Class' }}
          />
        </>
      ) : (
        <Stack.Screen name="AuthStack" component={AuthStack} />
      )}
    </Stack.Navigator>
  )
}
