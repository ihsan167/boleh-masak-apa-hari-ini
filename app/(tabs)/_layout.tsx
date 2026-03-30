import { Tabs } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'

const PRIMARY = '#2D6A4F'
const INACTIVE = '#95A5A6'

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: PRIMARY,
        tabBarInactiveTintColor: INACTIVE,
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: '#E8F5E9',
          paddingBottom: 5,
          height: 60,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
        headerStyle: { backgroundColor: PRIMARY },
        headerTintColor: '#FFFFFF',
        headerTitleStyle: { fontWeight: 'bold' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Utama',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" color={color} size={size} />
          ),
          headerTitle: 'Boleh Masak Apa Hari Ini?',
        }}
      />
      <Tabs.Screen
        name="ingredients"
        options={{
          title: 'Bahan',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="basket" color={color} size={size} />
          ),
          headerTitle: 'Bahan-Bahan',
        }}
      />
      <Tabs.Screen
        name="recipes"
        options={{
          title: 'Resepi',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="restaurant" color={color} size={size} />
          ),
          headerTitle: 'Cadangan Resepi',
        }}
      />
      <Tabs.Screen
        name="grocery"
        options={{
          title: 'Grocery',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cart" color={color} size={size} />
          ),
          headerTitle: 'Senarai Grocery',
        }}
      />
    </Tabs>
  )
}
