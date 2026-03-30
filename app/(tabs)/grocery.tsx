import { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Modal, TextInput, Alert, RefreshControl, KeyboardAvoidingView, Platform
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'

const PRIMARY = '#2D6A4F'
const DANGER = '#E74C3C'

type GroceryItem = {
  id: string
  name: string
  quantity: number
  unit: string
  checked: boolean
}

const UNITS = ['gram', 'kg', 'ml', 'liter', 'biji', 'sudu', 'cawan', 'peket', 'tin']

export default function GroceryScreen() {
  const [items, setItems] = useState<GroceryItem[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [form, setForm] = useState({ name: '', quantity: '1', unit: 'biji' })

  async function loadItems() {
    const { data } = await supabase
      .from('grocery_list')
      .select('*')
      .order('checked')
      .order('created_at', { ascending: false })
    if (data) setItems(data)
  }

  async function onRefresh() {
    setRefreshing(true)
    await loadItems()
    setRefreshing(false)
  }

  useEffect(() => { loadItems() }, [])

  async function addItem() {
    if (!form.name.trim()) return Alert.alert('Ralat', 'Nama item wajib diisi.')
    await supabase.from('grocery_list').insert({
      name: form.name.trim(),
      quantity: Number(form.quantity) || 1,
      unit: form.unit,
      checked: false,
    })
    setForm({ name: '', quantity: '1', unit: 'biji' })
    setModalVisible(false)
    loadItems()
  }

  async function toggleCheck(item: GroceryItem) {
    await supabase.from('grocery_list').update({ checked: !item.checked }).eq('id', item.id)
    loadItems()
  }

  async function deleteItem(id: string) {
    await supabase.from('grocery_list').delete().eq('id', id)
    loadItems()
  }

  async function clearChecked() {
    Alert.alert('Bersihkan Senarai', 'Padam semua item yang dah dibeli?', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Padam', style: 'destructive',
        onPress: async () => {
          await supabase.from('grocery_list').delete().eq('checked', true)
          loadItems()
        }
      }
    ])
  }

  async function moveToIngredients(item: GroceryItem) {
    Alert.alert('Tambah ke Bahan?', `Tambah "${item.name}" ke senarai bahan-bahan?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Ya',
        onPress: async () => {
          const { data: existing } = await supabase
            .from('ingredients')
            .select('id, quantity')
            .ilike('name', item.name)
            .single()

          if (existing) {
            await supabase.from('ingredients').update({
              quantity: existing.quantity + item.quantity,
              updated_at: new Date().toISOString(),
            }).eq('id', existing.id)
          } else {
            await supabase.from('ingredients').insert({
              name: item.name,
              quantity: item.quantity,
              unit: item.unit,
              category: 'Lain-lain',
            })
          }

          await supabase.from('grocery_list').delete().eq('id', item.id)
          loadItems()
          Alert.alert('Berjaya!', `"${item.name}" ditambah ke bahan-bahan.`)
        }
      }
    ])
  }

  const unchecked = items.filter(i => !i.checked)
  const checked = items.filter(i => i.checked)

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.headerInfo}>{unchecked.length} item belum beli</Text>
        {checked.length > 0 && (
          <TouchableOpacity onPress={clearChecked}>
            <Text style={styles.clearBtn}>Bersihkan ({checked.length})</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={items}
        keyExtractor={i => i.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PRIMARY} />}
        contentContainerStyle={{ padding: 12 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="cart-outline" size={60} color="#BDC3C7" />
            <Text style={styles.emptyText}>Senarai grocery kosong!</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.card, item.checked && styles.cardChecked]}>
            <TouchableOpacity onPress={() => toggleCheck(item)} style={styles.checkbox}>
              <Ionicons
                name={item.checked ? 'checkbox' : 'square-outline'}
                size={24}
                color={item.checked ? PRIMARY : '#BDC3C7'}
              />
            </TouchableOpacity>
            <View style={styles.cardContent}>
              <Text style={[styles.cardName, item.checked && styles.cardNameChecked]}>
                {item.name}
              </Text>
              <Text style={styles.cardQty}>{item.quantity} {item.unit}</Text>
            </View>
            <View style={styles.cardActions}>
              {item.checked && (
                <TouchableOpacity onPress={() => moveToIngredients(item)} style={styles.iconBtn}>
                  <Ionicons name="arrow-up-circle-outline" size={22} color={PRIMARY} />
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => deleteItem(item.id)} style={styles.iconBtn}>
                <Ionicons name="trash-outline" size={20} color={DANGER} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      />

      <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)}>
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </TouchableOpacity>

      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Tambah Item Grocery</Text>

            <Text style={styles.label}>Nama Item</Text>
            <TextInput
              style={styles.input}
              placeholder="cth: Telur"
              value={form.name}
              onChangeText={v => setForm(f => ({ ...f, name: v }))}
              autoFocus
            />

            <Text style={styles.label}>Kuantiti</Text>
            <TextInput
              style={styles.input}
              placeholder="1"
              keyboardType="numeric"
              value={form.quantity}
              onChangeText={v => setForm(f => ({ ...f, quantity: v }))}
            />

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

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.btnCancel} onPress={() => setModalVisible(false)}>
                <Text style={styles.btnCancelText}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnSave} onPress={addItem}>
                <Text style={styles.btnSaveText}>Tambah</Text>
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
  headerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#FFFFFF',
    borderBottomWidth: 1, borderBottomColor: '#E8F5E9',
  },
  headerInfo: { fontSize: 13, color: '#7F8C8D', fontWeight: '600' },
  clearBtn: { fontSize: 13, color: DANGER, fontWeight: '600' },
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14,
    marginBottom: 8, flexDirection: 'row', alignItems: 'center', elevation: 1,
  },
  cardChecked: { opacity: 0.6 },
  checkbox: { marginRight: 12 },
  cardContent: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: '600', color: '#2D3748' },
  cardNameChecked: { textDecorationLine: 'line-through', color: '#7F8C8D' },
  cardQty: { fontSize: 12, color: '#7F8C8D', marginTop: 2 },
  cardActions: { flexDirection: 'row' },
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
  input: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, padding: 10, fontSize: 14, backgroundColor: '#F8F9FA' },
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
