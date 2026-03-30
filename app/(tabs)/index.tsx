import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'

const PRIMARY = '#2D6A4F'
const ACCENT = '#F4A261'
const WARNING = '#E76F51'

export default function HomeScreen() {
  const router = useRouter()
  const [stats, setStats] = useState({ total: 0, lowStock: 0, grocery: 0, recipes: 0 })
  const [refreshing, setRefreshing] = useState(false)

  async function loadStats() {
    const [{ count: total }, { count: grocery }, { count: recipes }, { data: ingredients }] =
      await Promise.all([
        supabase.from('ingredients').select('*', { count: 'exact', head: true }),
        supabase.from('grocery_list').select('*', { count: 'exact', head: true }).eq('checked', false),
        supabase.from('recipes').select('*', { count: 'exact', head: true }),
        supabase.from('ingredients').select('quantity, low_stock_alert'),
      ])

    const lowStock = ingredients?.filter(
      (i) => i.quantity <= i.low_stock_alert
    ).length ?? 0

    setStats({ total: total ?? 0, lowStock, grocery: grocery ?? 0, recipes: recipes ?? 0 })
  }

  async function onRefresh() {
    setRefreshing(true)
    await loadStats()
    setRefreshing(false)
  }

  useEffect(() => { loadStats() }, [])

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PRIMARY} />}
    >
      <View style={styles.hero}>
        <Text style={styles.heroEmoji}>🍳</Text>
        <Text style={styles.heroTitle}>Selamat Datang!</Text>
        <Text style={styles.heroSub}>Nak masak apa hari ini?</Text>
      </View>

      <View style={styles.statsGrid}>
        <StatCard
          icon="basket"
          label="Jumlah Bahan"
          value={stats.total}
          color={PRIMARY}
          onPress={() => router.push('/(tabs)/ingredients')}
        />
        <StatCard
          icon="warning"
          label="Stok Rendah"
          value={stats.lowStock}
          color={stats.lowStock > 0 ? WARNING : PRIMARY}
          onPress={() => router.push('/(tabs)/ingredients')}
        />
        <StatCard
          icon="restaurant"
          label="Resepi Ada"
          value={stats.recipes}
          color={PRIMARY}
          onPress={() => router.push('/(tabs)/recipes')}
        />
        <StatCard
          icon="cart"
          label="Perlu Beli"
          value={stats.grocery}
          color={stats.grocery > 0 ? ACCENT : PRIMARY}
          onPress={() => router.push('/(tabs)/grocery')}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Tindakan Pantas</Text>
        <QuickAction
          icon="add-circle"
          label="Tambah Bahan Baru"
          onPress={() => router.push('/(tabs)/ingredients')}
        />
        <QuickAction
          icon="search"
          label="Cari Resepi Boleh Masak"
          onPress={() => router.push('/(tabs)/recipes')}
        />
        <QuickAction
          icon="cart"
          label="Buka Senarai Grocery"
          onPress={() => router.push('/(tabs)/grocery')}
        />
      </View>
    </ScrollView>
  )
}

function StatCard({ icon, label, value, color, onPress }: any) {
  return (
    <TouchableOpacity style={[styles.statCard, { borderTopColor: color }]} onPress={onPress}>
      <Ionicons name={icon} size={28} color={color} />
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </TouchableOpacity>
  )
}

function QuickAction({ icon, label, onPress }: any) {
  return (
    <TouchableOpacity style={styles.quickAction} onPress={onPress}>
      <Ionicons name={icon} size={22} color={PRIMARY} />
      <Text style={styles.quickActionLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color="#BDC3C7" />
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F7F4' },
  hero: { backgroundColor: PRIMARY, padding: 30, alignItems: 'center' },
  heroEmoji: { fontSize: 50, marginBottom: 8 },
  heroTitle: { fontSize: 24, fontWeight: 'bold', color: '#FFFFFF' },
  heroSub: { fontSize: 14, color: '#B7E4C7', marginTop: 4 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 10 },
  statCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    width: '47%',
    borderTopWidth: 4,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  statValue: { fontSize: 32, fontWeight: 'bold', marginTop: 8 },
  statLabel: { fontSize: 12, color: '#7F8C8D', marginTop: 4, textAlign: 'center' },
  section: { margin: 16 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#2D3748', marginBottom: 12 },
  quickAction: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  quickActionLabel: { flex: 1, marginLeft: 12, fontSize: 14, color: '#2D3748', fontWeight: '500' },
})
