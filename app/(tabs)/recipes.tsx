import { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Modal, ScrollView, RefreshControl, Image
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'

const PRIMARY = '#2D6A4F'
const ACCENT = '#F4A261'

type Recipe = {
  id: string
  name: string
  chef: string
  source_url: string
  image_url: string
  instructions: string
  servings: number
  matchPercent?: number
  missingIngredients?: string[]
  recipe_ingredients?: RecipeIngredient[]
}

type RecipeIngredient = {
  id: string
  ingredient_name: string
  quantity: number
  unit: string
}

export default function RecipesScreen() {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [selected, setSelected] = useState<Recipe | null>(null)
  const [filter, setFilter] = useState<'all' | 'canCook' | 'almost'>('all')

  async function loadRecipes() {
    const [{ data: recipeData }, { data: myIngredients }] = await Promise.all([
      supabase.from('recipes').select('*, recipe_ingredients(*)').order('name'),
      supabase.from('ingredients').select('name, quantity'),
    ])

    if (!recipeData) return

    const myNames = (myIngredients ?? [])
      .filter(i => i.quantity > 0)
      .map(i => i.name.toLowerCase().trim())

    const enriched = recipeData.map((recipe: Recipe) => {
      const required = recipe.recipe_ingredients ?? []
      if (required.length === 0) return { ...recipe, matchPercent: 0, missingIngredients: [] }

      const missing = required.filter(
        ri => !myNames.some(n => n.includes(ri.ingredient_name.toLowerCase().trim()) ||
          ri.ingredient_name.toLowerCase().trim().includes(n))
      )

      const matchPercent = Math.round(((required.length - missing.length) / required.length) * 100)
      return {
        ...recipe,
        matchPercent,
        missingIngredients: missing.map(m => m.ingredient_name),
      }
    })

    enriched.sort((a: Recipe, b: Recipe) => (b.matchPercent ?? 0) - (a.matchPercent ?? 0))
    setRecipes(enriched)
  }

  async function onRefresh() {
    setRefreshing(true)
    await loadRecipes()
    setRefreshing(false)
  }

  useEffect(() => { loadRecipes() }, [])

  const filtered = recipes.filter(r => {
    if (filter === 'canCook') return (r.matchPercent ?? 0) >= 100
    if (filter === 'almost') return (r.matchPercent ?? 0) >= 70 && (r.matchPercent ?? 0) < 100
    return true
  })

  function matchColor(pct: number) {
    if (pct >= 100) return '#27AE60'
    if (pct >= 70) return ACCENT
    return '#E74C3C'
  }

  return (
    <View style={styles.container}>
      <View style={styles.filterRow}>
        {(['all', 'canCook', 'almost'] as const).map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.filterBtn, filter === f && styles.filterBtnActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f === 'all' ? 'Semua' : f === 'canCook' ? '✅ Boleh Masak' : '⚡ Hampir'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={r => r.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PRIMARY} />}
        contentContainerStyle={{ padding: 12 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="restaurant-outline" size={60} color="#BDC3C7" />
            <Text style={styles.emptyText}>Tiada resepi lagi.</Text>
            <Text style={styles.emptySubText}>Resepi akan diisi secara automatik setiap hari!</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => setSelected(item)}>
            {item.image_url ? (
              <Image source={{ uri: item.image_url }} style={styles.cardImage} />
            ) : (
              <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
                <Ionicons name="restaurant" size={30} color="#BDC3C7" />
              </View>
            )}
            <View style={styles.cardContent}>
              <Text style={styles.cardName} numberOfLines={2}>{item.name}</Text>
              <Text style={styles.cardChef}>{item.chef}</Text>
              <View style={styles.matchRow}>
                <View style={[styles.matchBar, { backgroundColor: '#E8F5E9' }]}>
                  <View style={[styles.matchFill, {
                    width: `${item.matchPercent}%` as any,
                    backgroundColor: matchColor(item.matchPercent ?? 0)
                  }]} />
                </View>
                <Text style={[styles.matchPct, { color: matchColor(item.matchPercent ?? 0) }]}>
                  {item.matchPercent}%
                </Text>
              </View>
              {(item.missingIngredients?.length ?? 0) > 0 && (
                <Text style={styles.missingText} numberOfLines={1}>
                  Kurang: {item.missingIngredients?.join(', ')}
                </Text>
              )}
            </View>
          </TouchableOpacity>
        )}
      />

      <Modal visible={!!selected} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <ScrollView>
              {selected?.image_url ? (
                <Image source={{ uri: selected.image_url }} style={styles.modalImage} />
              ) : (
                <View style={[styles.modalImage, styles.cardImagePlaceholder]}>
                  <Ionicons name="restaurant" size={50} color="#BDC3C7" />
                </View>
              )}
              <View style={{ padding: 20 }}>
                <Text style={styles.modalTitle}>{selected?.name}</Text>
                <Text style={styles.modalChef}>oleh {selected?.chef}</Text>

                <Text style={styles.sectionTitle}>Bahan-Bahan</Text>
                {selected?.recipe_ingredients?.map(ri => (
                  <Text key={ri.id} style={styles.ingredient}>
                    • {ri.ingredient_name} — {ri.quantity} {ri.unit}
                  </Text>
                ))}

                {(selected?.missingIngredients?.length ?? 0) > 0 && (
                  <View style={styles.missingBox}>
                    <Text style={styles.missingTitle}>Bahan Yang Kurang:</Text>
                    {selected?.missingIngredients?.map(m => (
                      <Text key={m} style={styles.missingItem}>• {m}</Text>
                    ))}
                  </View>
                )}

                {selected?.instructions && (
                  <>
                    <Text style={styles.sectionTitle}>Cara Masak</Text>
                    <Text style={styles.instructions}>{selected.instructions}</Text>
                  </>
                )}

                {selected?.source_url && (
                  <Text style={styles.sourceUrl}>Sumber: {selected.source_url}</Text>
                )}
              </View>
            </ScrollView>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setSelected(null)}>
              <Text style={styles.closeBtnText}>Tutup</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F7F4' },
  filterRow: { flexDirection: 'row', padding: 12, gap: 8 },
  filterBtn: { flex: 1, padding: 8, borderRadius: 20, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center' },
  filterBtnActive: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  filterText: { fontSize: 12, color: '#7F8C8D', fontWeight: '600' },
  filterTextActive: { color: '#FFFFFF' },
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 12, marginBottom: 10,
    flexDirection: 'row', overflow: 'hidden', elevation: 2,
  },
  cardImage: { width: 90, height: 90 },
  cardImagePlaceholder: { backgroundColor: '#F0F7F4', alignItems: 'center', justifyContent: 'center' },
  cardContent: { flex: 1, padding: 10 },
  cardName: { fontSize: 14, fontWeight: 'bold', color: '#2D3748' },
  cardChef: { fontSize: 11, color: '#7F8C8D', marginTop: 2 },
  matchRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  matchBar: { flex: 1, height: 6, borderRadius: 3, marginRight: 6, overflow: 'hidden' },
  matchFill: { height: '100%', borderRadius: 3 },
  matchPct: { fontSize: 12, fontWeight: 'bold', width: 36 },
  missingText: { fontSize: 11, color: '#E74C3C', marginTop: 4 },
  empty: { alignItems: 'center', marginTop: 80 },
  emptyText: { color: '#BDC3C7', marginTop: 12, fontSize: 14 },
  emptySubText: { color: '#BDC3C7', marginTop: 4, fontSize: 12, textAlign: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%' },
  modalImage: { width: '100%', height: 200 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#2D3748', marginTop: 4 },
  modalChef: { fontSize: 13, color: '#7F8C8D', marginTop: 4 },
  sectionTitle: { fontSize: 15, fontWeight: 'bold', color: PRIMARY, marginTop: 16, marginBottom: 8 },
  ingredient: { fontSize: 13, color: '#4A5568', marginBottom: 4 },
  missingBox: { backgroundColor: '#FFF5F5', borderRadius: 8, padding: 12, marginTop: 12 },
  missingTitle: { fontSize: 13, fontWeight: 'bold', color: '#E74C3C', marginBottom: 6 },
  missingItem: { fontSize: 13, color: '#E74C3C' },
  instructions: { fontSize: 13, color: '#4A5568', lineHeight: 22 },
  sourceUrl: { fontSize: 11, color: '#7F8C8D', marginTop: 12 },
  closeBtn: { margin: 16, backgroundColor: PRIMARY, borderRadius: 10, padding: 14, alignItems: 'center' },
  closeBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 15 },
})
