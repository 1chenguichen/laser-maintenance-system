import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { logout, getUser, getEngineerStats } from '../api';

export default function ProfileScreen({ navigation }: any) {
  const [user, setUser] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const userData = await getUser();
      setUser(userData);
      const statsData = await getEngineerStats();
      setStats(statsData);
    } catch (e) {
      console.error('Load profile error:', e);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      '确认退出',
      '确定要退出登录吗？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确定',
          onPress: async () => {
            await logout();
            // 跳转到登录页（通过重置导航）
            navigation.reset({
              index: 0,
              routes: [{ name: 'Login' }],
            });
          },
        },
      ]
    );
  };

  const rating = stats?.history?.avgRating || 5.0;
  const tier = stats?.currentMonth?.orderCount >= 31 ? '金牌' : stats?.currentMonth?.orderCount >= 11 ? '银牌' : '铜牌';

  return (
    <ScrollView style={styles.container}>
      {/* Profile Header */}
      <View style={styles.header}>
        <Text style={styles.avatar}>👷</Text>
        <Text style={styles.name}>{user?.name || '工程师'}</Text>
        <Text style={styles.phone}>{user?.phone ? user.phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : '未登录'}</Text>
        <View style={styles.badges}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>🏆 {tier}工程师</Text>
          </View>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>⭐ {rating.toFixed(1)}分</Text>
          </View>
        </View>
      </View>

      {/* Menu */}
      <View style={styles.menuSection}>
        <TouchableOpacity style={styles.menuItem}>
          <Text style={styles.menuIcon}>📊</Text>
          <Text style={styles.menuText}>收益统计</Text>
          <Text style={styles.menuArrow}>→</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem}>
          <Text style={styles.menuIcon}>💰</Text>
          <Text style={styles.menuText}>提现记录</Text>
          <Text style={styles.menuArrow}>→</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem}>
          <Text style={styles.menuIcon}>📋</Text>
          <Text style={styles.menuText}>资质认证</Text>
          <Text style={styles.menuArrow}>→</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.menuSection}>
        <TouchableOpacity style={styles.menuItem}>
          <Text style={styles.menuIcon}>📍</Text>
          <Text style={styles.menuText}>常用地址</Text>
          <Text style={styles.menuArrow}>→</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem}>
          <Text style={styles.menuIcon}>🔧</Text>
          <Text style={styles.menuText}>擅长工种</Text>
          <Text style={styles.menuArrow}>→</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem}>
          <Text style={styles.menuIcon}>⚙️</Text>
          <Text style={styles.menuText}>设置</Text>
          <Text style={styles.menuArrow}>→</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.menuSection}>
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
      </View>

      {/* Logout */}
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>退出登录</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { backgroundColor: '#1890ff', padding: 30, alignItems: 'center' },
  avatar: { fontSize: 60 },
  name: { fontSize: 18, fontWeight: 'bold', color: '#fff', marginTop: 10 },
  phone: { fontSize: 14, color: '#fff', marginTop: 5, opacity: 0.8 },
  badges: { flexDirection: 'row', gap: 10, marginTop: 15 },
  badge: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12 },
  badgeText: { color: '#fff', fontSize: 12 },
  menuSection: { backgroundColor: '#fff', marginTop: 15 },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  menuIcon: { fontSize: 20, marginRight: 15 },
  menuText: { flex: 1, fontSize: 14 },
  menuArrow: { color: '#999' },
  logoutButton: { backgroundColor: '#fff', margin: 15, padding: 15, borderRadius: 8, alignItems: 'center' },
  logoutText: { color: '#ff4d4f', fontSize: 16 },
});
