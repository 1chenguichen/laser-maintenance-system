import React from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';

const mockDevices = [
  {
    id: '1',
    model: '激光切割机 JC-5000',
    serial: 'SN2023****XXX',
    type: 'laser_cutter',
    warranty: '2025-03-15',
    location: '北京朝阳XX大厦 A座',
  },
  {
    id: '2',
    model: '激光焊接机 W-200',
    serial: 'SN2024****YYY',
    type: 'laser_welder',
    warranty: '2026-06-20',
    location: '北京海淀XX产业园',
  },
];

export default function DeviceListScreen({ navigation }: any) {
  return (
    <View style={styles.container}>
      <FlatList
        data={mockDevices}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.deviceCard}
            onPress={() => navigation.navigate('DeviceScan')}
          >
            <Text style={styles.deviceIcon}>🖥</Text>
            <View style={styles.deviceInfo}>
              <Text style={styles.deviceModel}>{item.model}</Text>
              <Text style={styles.deviceSerial}>{item.serial}</Text>
              <Text style={styles.deviceLocation}>📍 {item.location}</Text>
              <Text style={styles.deviceWarranty}>
                保修至: {item.warranty} {new Date(item.warranty) > new Date() ? '✓' : '(已过期)'}
              </Text>
            </View>
            <Text style={styles.arrow}>→</Text>
          </TouchableOpacity>
        )}
        ListFooterComponent={
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => navigation.navigate('DeviceScan')}
          >
            <Text style={styles.addButtonText}>+ 绑定新设备</Text>
          </TouchableOpacity>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  deviceCard: {
    backgroundColor: '#fff',
    margin: 15,
    padding: 15,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  deviceIcon: { fontSize: 40 },
  deviceInfo: { flex: 1, marginLeft: 15 },
  deviceModel: { fontSize: 16, fontWeight: 'bold' },
  deviceSerial: { fontSize: 13, color: '#999', marginTop: 3 },
  deviceLocation: { fontSize: 12, color: '#666', marginTop: 5 },
  deviceWarranty: { fontSize: 12, color: '#52c41a', marginTop: 3 },
  arrow: { fontSize: 20, color: '#999' },
  addButton: { backgroundColor: '#fff', margin: 15, padding: 15, borderRadius: 8, borderWidth: 1, borderColor: '#1890ff', borderStyle: 'dashed', alignItems: 'center' },
  addButtonText: { color: '#1890ff', fontSize: 14 },
});
