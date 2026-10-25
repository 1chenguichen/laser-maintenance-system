import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';

export default function ProfileScreen() {
  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.avatar}>👤</Text>
        <Text style={styles.name}>张三</Text>
        <Text style={styles.phone}>138****5678</Text>
      </View>

      <View style={styles.section}>
        <TouchableOpacity style={styles.menuItem}>
          <Text style={styles.menuIcon}>📍</Text>
          <Text style={styles.menuText}>地址管理</Text>
          <Text style={styles.menuArrow}>→</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem}>
          <Text style={styles.menuIcon}>🖥</Text>
          <Text style={styles.menuText}>设备管理</Text>
          <Text style={styles.menuArrow}>→</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem}>
          <Text style={styles.menuIcon}>💳</Text>
          <Text style={styles.menuText}>支付管理</Text>
          <Text style={styles.menuArrow}>→</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <TouchableOpacity style={styles.menuItem}>
          <Text style={styles.menuIcon}>📞</Text>
          <Text style={styles.menuText}>联系客服</Text>
          <Text style={styles.menuArrow}>→</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem}>
          <Text style={styles.menuIcon}>❓</Text>
          <Text style={styles.menuText}>帮助中心</Text>
          <Text style={styles.menuArrow}>→</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem}>
          <Text style={styles.menuIcon}>⚙️</Text>
          <Text style={styles.menuText}>设置</Text>
          <Text style={styles.menuArrow}>→</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    backgroundColor: '#1890ff',
    padding: 30,
    alignItems: 'center',
  },
  avatar: { fontSize: 60 },
  name: { fontSize: 18, fontWeight: 'bold', color: '#fff', marginTop: 10 },
  phone: { fontSize: 14, color: '#fff', marginTop: 5, opacity: 0.8 },
  section: { backgroundColor: '#fff', marginTop: 15 },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  menuIcon: { fontSize: 20, marginRight: 15 },
  menuText: { flex: 1, fontSize: 14 },
  menuArrow: { color: '#999' },
});
