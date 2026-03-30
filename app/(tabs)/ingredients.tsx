import { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Modal, TextInput, Alert, RefreshControl, KeyboardAvoidingView, Platform
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'

const PRIMARY = '#2D6A4F'
const WARNING = '#F39C12'
const DANGER = '#E74C3C'

type Ingredient = {
  id: string
  name: string
  quantity: number
  unit: string
  category: string
  low_stock_alert: number
}

const UNITS = ['gram', 'kg', 'ml', 'liter', 'biji', 'sudu', 'cawan', 'peket', 'tin']
const CATEGORIES = ['Sayur', 'Daging', 'Ikan', 'Rempah', 'Bahan Kering', 'Minuman', 'Lain-lain']

export default function IngredientsScreen() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editing, setEditing] = useState<Ingredient | null>(null)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({ name: '', quantity: '', unit: 'gram', category: 'Lain-lain', low_stock_alert: '1' })

  async function loadIngredients() {
    const { data } = await supabase.from('ingredients').select('*').order('name')
    if (data) setIngredients(data)
  }

  async function onRefresh() {
    setRefreshing(true)
    await loadIngredients()
    setRefreshing(false)
  }

  useEffect(() => { loadIngredients() }, [])

  function openAdd() {
    setEditing(null)
    setForm({ name: '', quantity: '', unit: 'gram', category: 'Lain-lain', low_stock_alert: '1' })
    setModalVisible(true)
  }

  function openEdit(item: Ingredient) {
    setEditing(item)
    setForm({
      name: item.name,
      quantity: String(item.quantity),
      unit: item.unit,
      category: item.category,
      low_stock_alert: String(item.low_stock_alert),
    })
    setModalVisible(true)
  }

  async function saveIngredient() {
    if (!form.name.trim()) return Alert.alert('Ralat', 'Nama bahan wajib diisi.')
    if (!form.quantity || isNaN(Number(form.quantity))) return Alert.alert('Ralat', 'Kuantiti tidak sah.')

    const payload = {
      name: form.name.trim(),
      quantity: Number(form.quantity),
      unit: form.unit,
      category: form.category,
      low_stock_alert: Number(form.low_stock_alert) || 1,
      updated_at: new Date().toISOString(),
    }

    if (editing) {
      await supabase.from('ingredients').update(payload).eq('id', editing.id)
    } else {
      await supabase.from('ingredients').insert(payload)
    }

    setModalVisible(false)
    loadIngredients()
  }

  async function deleteIngredient(id: string, name: string) {
    Alert.alert('Padam Bahan', `Padam "${name}"?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Padam', style: 'destructive',
        onPress: async () => {
          await supabase.from('ingredients').delete().eq('id', id)
          loadIngredients()
        }
      }
    ])
  }

  async function addToGrocery(item: Ingredient) {
    await supabase.from('grocery_list').insert({
      name: item.name,
      quantity: item.low_stock_alert,
      unit: item.unit,
    })
    Alert.alert('Berjaya!', `"${item.name}" ditambah ke senarai grocery.`)
  }

  const filtered = ingredients.filter(i =>
    i.name.toLowerCase().includes(search.toLowerCase())
  )

  function stockStatus(item: Ingredient) {
    if (item.quantity === 0) return 'out'
    if (item.quantity <= item.low_stock_alert) return 'low'
    return 'ok'
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color="#7F8C8D" />
        <TextInput
          style={styles.searchInput}
          placeholder="Cari bahan..."
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={i => i.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PRIMARY} />}
        contentContainerStyle={{ padding: 12 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="basket-outline" size={60} color="#BDC3C7" />
            <Text style={styles.emptyText}>Tiada bahan lagi. Tambah sekarang!</Text>
          </View>
        }
        renderItem={({ item }) => {
          const status = stockStatus(item)
          return (
            <View style={[styles.card, status === 'out' && styles.cardOut, status === 'low' && styles.cardLow]}>
              <View style={styles.cardLeft}>
                <View style={[styles.dot, { backgroundColor: status === 'ok' ? PRIMARY : status === 'low' ? WARNING : DANGER }]} />
                <View>
                  <Text style={styles.cardName}>{item.name}</Text>
                  <Text style={styles.cardCategory}>{item.category}</Text>
                </View>
              </View>
              <View style={styles.cardRight}>
                <Text style={[styles.cardQty, { color: status === 'ok' ? PRIMARY : status === 'low' ? WARNING : DANGER }]}>
                  {item.quantity} {item.unit}
                </Text>
                <View style={styles.cardActions}>
                  <TouchableOpacity onPress={() => addToGrocery(item)} style={styles.iconBtn}>
                    <Ionicons name="cart-outline" size={18} color="#3498DB" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => openEdit(item)} style={styles.iconBtn}>
                    <Ionicons name="pencil-outline" size={18} color={PRIMARY} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => deleteIngredient(item.id, item.name)} style={styles.iconBtn}>
                    <Ionicons name="trash-outline" size={18} color={DANGER} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )
        }}
      />

      <TouchableOpacity style={styles.fab} onPress={openAdd}>
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </TouchableOpacity>

      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>{editing ? 'Edit Bahan' : 'Tambah Bahan'}</Text>

            <Text style={styles.label}>Nama Bahan</Text>
            <TextInput
              style={styles.input}
              placeholder="cth: Bawang merah"
              value={form.name}
              onChangeText={v => setForm(f => ({ ...f, name: v }))}
            />

            <View style={styles.row}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.label}>Kuantiti</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0"
                  keyboardType="numeric"
                  value={form.quantity}
                  onChangeText={v => setForm(f => ({ ...f, quantity: v }))}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Unit</Text>
                <View style={styles.pillRow}>
                  {UNITS.map(u => (
                    <TouchableOpacity
                      key={u}
                      style={[styles.pill, form.unit === u && styles.pillActive]}
                      onPress={() => setForm(f => ({ ...f, unit: u }))}
                    >
                      <Text style={[styles.pillText, form.unit === u && styles.pillTextActive]}>{u}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            <Text style={styles.label}>Kategori</Text>
            <View style={styles.pillRow}>
              {CATEGORIES.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[styles.pill, form.category === c && styles.pillActive]}
                  onPress={() => setForm(f => ({ ...f, category: c }))}
                >
                  <Text style={[styles.pillText, form.category === c && styles.pillTextActive]}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Amaran Stok Rendah (bawah)</Text>
            <TextInput
              style={styles.input}
              placeholder="1"
              keyboardType="numeric"
              value={form.low_stock_alert}
              onChangeText={v => setForm(f => ({ ...f, low_stock_alert: v }))}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.btnCancel} onPress={() => setModalVisible(false)}>
                <Text style={styles.btnCancelText}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnSave} onPress={saveIngredient}>
                <Text style={styles.btnSaveText}>Simpan</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F7F4' },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFFFFF', margin: 12, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3, elevation: 2,
  },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 14 },
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14,
    marginBottom: 8, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', elevation: 1,
  },
  cardOut: { backgroundColor: '#FFF5F5' },
  cardLow: { backgroundColor: '#FFFBF0' },
  cardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  cardName: { fontSize: 15, fontWeight: '600', color: '#2D3748' },
  cardCategory: { fontSize: 11, color: '#7F8C8D', marginTop: 2 },
  cardRight: { alignItems: 'flex-end' },
  cardQty: { fontSize: 14, fontWeight: 'bold' },
  cardActions: { flexDirection: 'row', marginTop: 6 },
  iconBtn: { padding: 4, marginLeft: 4 },
  empty: { alignItems: 'center', marginTop: 80 },
  emptyText: { color: '#BDC3C7', marginTop: 12, fontSize: 14 },
  fab: {
    position: 'absolute', bottom: 24, right: 24,
    backgroundColor: PRIMARY, width: 56, height: 56,
    borderRadius: 28, alignItems: 'center', justifyContent: 'center',
    elevation: 5, shadowColor: PRIMARY, shadowOpacity: 0.4, shadowRadius: 8,
  },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalBox: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#2D3748', marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#7F8C8D', marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8,
    padding: 10, fontSize: 14, backgroundColor: '#F8F9FA',
  },
  row: { flexDirection: 'row' },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  pillActive: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  pillText: { fontSize: 12, color: '#7F8C8D' },
  pillTextActive: { color: '#FFFFFF', fontWeight: '600' },
  modalButtons: { flexDirection: 'row', marginTop: 20, gap: 10 },
  btnCancel: { flex: 1, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center' },
  btnCancelText: { color: '#7F8C8D', fontWeight: '600' },
  btnSave: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: PRIMARY, alignItems: 'center' },
  btnSaveText: { color: '#FFFFFF', fontWeight: '600' },
})
