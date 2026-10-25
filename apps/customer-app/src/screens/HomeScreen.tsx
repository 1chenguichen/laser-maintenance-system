import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';

export default function HomeScreen({ navigation }: any) {
  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>LaserCare</Text>
        <Text style={styles.subtitle}>激光维保</Text>
      </View>

      <TouchableOpacity
        style={styles.repairButton}
        onPress={() => navigation.navigate('DeviceScan')}
      >
        <Text style={styles.repairButtonIcon}>🔧</Text>
        <Text style={styles.repairButtonTitle}>设备报修</Text>
        <Text style={styles.repairButtonDesc}>一键预约，快速上门服务</Text>
      </TouchableOpacity>

      <View style={styles.quickActions}>
        <TouchableOpacity
          style={styles.actionItem}
          onPress={() => navigation.navigate('DeviceScan')}
        >
          <Text style={styles.actionIcon}>📷</Text>
          <Text style={styles.actionText}>扫码识别设备</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionItem}
          onPress={() => navigation.navigate('DeviceList')}
        >
          <Text style={styles.actionIcon}>🖥</Text>
          <Text style={styles.actionText}>我的设备</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>我的设备</Text>
        <TouchableOpacity
          style={styles.deviceCard}
          onPress={() => navigation.navigate('DeviceList')}
        >
          <Text style={styles.deviceIcon}>🖥</Text>
          <View style={styles.deviceInfo}>
            <Text style={styles.deviceModel}>激光切割机 JC-5000</Text>
            <Text style={styles.deviceSerial}>SN2023****XXX</Text>
            <Text style={styles.deviceLocation}>北京朝阳XX大厦 A座</Text>
          </View>
          <Text style={styles.deviceArrow}>→</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    backgroundColor: '#1890ff',
    padding: 20,
    paddingTop: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  subtitle: { color: '#fff', fontSize: 14 },
  repairButton: {
    backgroundColor: '#1890ff',
    margin: 20,
    padding: 20,
    borderRadius: 12,
  },
  repairButtonIcon: { fontSize: 40, textAlign: 'center' },
  repairButtonTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 10,
  },
  repairButtonDesc: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 5,
  },
  quickActions: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  actionItem: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 8,
    marginHorizontal: 5,
    alignItems: 'center',
  },
  actionIcon: { fontSize: 30 },
  actionText: { fontSize: 12, marginTop: 5, color: '#666' },
  section: { padding: 20 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 10 },
  deviceCard: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  deviceIcon: { fontSize: 30, marginRight: 15 },
  deviceInfo: { flex: 1 },
  deviceModel: { fontSize: 14, fontWeight: 'bold' },
  deviceSerial: { fontSize: 12, color: '#999', marginTop: 2 },
  deviceLocation: { fontSize: 12, color: '#666', marginTop: 2 },
  deviceArrow: { fontSize: 20, color: '#999' },
});
