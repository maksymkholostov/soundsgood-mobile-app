import React from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { Provider as ReduxProvider } from 'react-redux'
import { Provider as PaperProvider } from 'react-native-paper'
import { StatusBar } from 'expo-status-bar'
import { MaterialCommunityIcons } from '@expo/vector-icons'

import { store } from './src/store/store'
import { appTheme } from './src/theme/theme'
import { RootNavigator } from './src/navigation/RootNavigator'

export default function App() {
  return (
    <ReduxProvider store={store}>
      <PaperProvider
        theme={appTheme}
        settings={{
          icon: (props) => <MaterialCommunityIcons {...props} />,
        }}
      >
        <NavigationContainer>
          <RootNavigator />
          <StatusBar style="light" />
        </NavigationContainer>
      </PaperProvider>
    </ReduxProvider>
  );
}
