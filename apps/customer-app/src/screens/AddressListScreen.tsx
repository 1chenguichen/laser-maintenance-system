import React from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';

const mockAddresses = [
  { id: '1', label: '公司', address: '北京朝阳区XX大厦 A座 101室', isDefault: true },
  { id: '2', label: '仓库', address: '北京海淀区XX产业园 B栋 202', isDefault: false },
];

export default function AddressListScreen() {
  return (
    <View style={styles.container}>
      <FlatList
        data={mockAddresses}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.addressCard}>
            <View style={styles.addressHeader}>
              <Text style={styles.label}>{item.label}</Text>
              {item.isDefault && <Text style={styles.default}>默认</Text>}
            </View>
            <Text style={styles.address}>{item.address}</Text>
            <View style={styles.actions}>
              <TouchableOpacity><Text style={styles.action}>编辑</Text></TouchableOpacity>
              <TouchableOpacity><Text style={[styles.action, styles.delete]}>删除</Text></TouchableOpacity>
            </View>
          </TouchableOpacity>
        )}
        ListFooterComponent={
          <TouchableOpacity style={styles.addButton}>
            <Text style={styles.addButtonText}>+ 添加新地址</Text>
          </TouchableOpacity>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  addressCard: { backgroundColor: '#fff', margin: 15, padding: 15, borderRadius: 8 },
  addressHeader: { flexDirection: 'row', alignItems: 'center' },
  label: { fontSize: 16, fontWeight: 'bold' },
  default: { backgroundColor: '#1890ff', color: '#fff', fontSize: 12, paddingHorizontal: 8, borderRadius: 10, marginLeft: 10 },
  address: { fontSize: 14, color: '#666', marginTop: 8 },
  actions: { flexDirection: 'row', gap: 20, marginTop: 10 },
  action: { fontSize: 14, color: '#1890ff' },
  delete: { color: '#ff4d4f' },
  addButton: { backgroundColor: '#fff', margin: 15, padding: 15, borderRadius: 8, borderWidth: 1, borderColor: '#1890ff', borderStyle: 'dashed', alignItems: 'center' },
  addButtonText: { color: '#1890ff', fontSize: 14 },
});
