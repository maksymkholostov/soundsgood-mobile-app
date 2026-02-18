import React from 'react'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { MaterialCommunityIcons } from '@expo/vector-icons'

import type { MainTabParamList } from './types'
import { DashboardScreen } from '../screens/DashboardScreen'
import { SoundClassesScreen } from '../screens/SoundClassesScreen'
import { RecordSoundsScreen } from '../screens/RecordSoundsScreen'
import { VerifySoundsScreen } from '../screens/VerifySoundsScreen'
import { SettingsScreen } from '../screens/SettingsScreen'

const Tab = createBottomTabNavigator<MainTabParamList>()

export function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: true,
        tabBarShowLabel: true,
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="view-dashboard" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Classes"
        component={SoundClassesScreen}
        options={{
          title: 'Classes',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="format-list-bulleted" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Record"
        component={RecordSoundsScreen}
        options={{
          title: 'Record',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="microphone" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Verify"
        component={VerifySoundsScreen}
        options={{
          title: 'Verify',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="check-circle-outline" color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="cog" color={color} size={size} />
          ),
        }}
      />
    </Tab.Navigator>
  )
}
