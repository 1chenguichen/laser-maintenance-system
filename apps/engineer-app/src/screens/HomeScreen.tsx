import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl, Alert } from 'react-native';
import { EngineerStatus } from '../types';
import { getGrabPool, grabOrder, updateEngineerStatus, getEngineerStats, getEngineerStatus } from '../api';

const STATUS_TEXT: Record<EngineerStatus, string> = {
  [EngineerStatus.ONLINE]: '🟢 在线',
  [EngineerStatus.OFFLINE]: '⚫ 离线',
  [EngineerStatus.WORKING]: '🔵 工作中',
};

// 统一 API 响应格式
function unwrapData(data: any): any {
  if (Array.isArray(data)) return data;
  if (data?.data !== undefined) return data.data;
  return data;
}

export default function HomeScreen({ navigation }: any) {
  const [status, setStatus] = useState<EngineerStatus>(EngineerStatus.ONLINE);
  const [orders, setOrders] = useState<any[]>([]);
  const [stats, setStats] = useState({ monthlyOrders: 0, monthlyRevenue: 0, commissionRate: 0.2 });
  const [refreshing, setRefreshing] = useState(false);
  const [grabbing, setGrabbing] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [pool, engineerStats, engineerStatus] = await Promise.all([
        getGrabPool().catch(() => []),
        getEngineerStats().catch(() => null),
        getEngineerStatus().catch(() => ({ status: EngineerStatus.ONLINE })),
      ]);

      setOrders(unwrapData(pool) || []);

      if (engineerStats) {
        const s = unwrapData(engineerStats);
        setStats({
          monthlyOrders: s?.currentMonth?.orderCount || 0,
          monthlyRevenue: s?.currentMonth?.revenue || 0,
          commissionRate: s?.currentMonth?.commissionRate || 0.2,
        });
      }

      if (engineerStatus?.status) {
        setStatus(engineerStatus.status as EngineerStatus);
      }
    } catch (e) {
      console.error('Load data error:', e);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleStatusChange = async (newStatus: EngineerStatus) => {
    try {
      await updateEngineerStatus(newStatus);
      setStatus(newStatus);
    } catch (e: any) {
      Alert.alert('切换状态失败', e.message);
    }
  };

  const handleGrab = async (orderId: string) => {
    Alert.alert(
      '确认抢单',
      '确定要抢这个订单吗？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确定',
          onPress: async () => {
            setGrabbing(orderId);
            try {
              await grabOrder(orderId);
              Alert.alert('抢单成功', '请等待客户确认');
              loadData();
            } catch (e: any) {
              Alert.alert('抢单失败', e.message);
            } finally {
              setGrabbing(null);
            }
          },
        },
      ]
    );
  };

  const getCommissionText = () => {
    const rate = stats.commissionRate * 100;
    return `${rate.toFixed(0)}%`;
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Status Toggle */}
      <View style={styles.statusCard}>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>当前状态</Text>
          <View style={[styles.statusBadge, status === EngineerStatus.ONLINE && styles.statusOnline]}>
            <Text style={styles.statusText}>{STATUS_TEXT[status]}</Text>
          </View>
        </View>
        <View style={styles.statusButtons}>
          {[
            { key: EngineerStatus.ONLINE, label: '接单' },
            { key: EngineerStatus.WORKING, label: '工作中' },
            { key: EngineerStatus.OFFLINE, label: '下线' },
          ].map(({ key, label }) => (
            <TouchableOpacity
              key={key}
              style={[styles.statusButton, status === key && styles.statusButtonActive]}
              onPress={() => handleStatusChange(key)}
            >
              <Text style={[styles.statusButtonText, status === key && styles.statusButtonTextActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Location */}
      <View style={styles.locationCard}>
        <Text style={styles.locationIcon}>📍</Text>
        <View style={styles.locationInfo}>
          <Text style={styles.locationText}>正在获取位置...</Text>
          <Text style={styles.locationHint}>GPS定位中</Text>
        </View>
        <TouchableOpacity style={styles.refreshButton} onPress={onRefresh}>
          <Text style={styles.refreshText}>刷新</Text>
        </TouchableOpacity>
      </View>

      {/* Grab Pool */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>🏊 可抢订单池</Text>
          <Text style={styles.sectionCount}>{orders.length}个新订单</Text>
        </View>

        {orders.length === 0 ? (
          <View style={styles.emptyPool}>
            <Text style={styles.emptyText}>暂无可抢订单</Text>
          </View>
        ) : (
          orders.map((order) => (
            <TouchableOpacity
              key={order.id}
              style={styles.orderCard}
              onPress={() => navigation.navigate('OrderDetail', { orderId: order.id })}
            >
              <View style={styles.orderHeader}>
                <Text style={styles.orderType}>{order.faultType || '维修订单'}</Text>
                <Text style={styles.orderDistance}>
                  {order.emergencyLevel >= 3 ? '🔥 紧急' : ''}
                </Text>
              </View>
              <Text style={styles.orderAddress}>
                📍 {order.address ? `${order.address.city || ''}${order.address.district || ''}${order.address.detail || ''}` : '地址待确认'}
              </Text>
              <View style={styles.orderFooter} onTouchEnd={(e) => { e.stopPropagation(); }}>
                <Text style={styles.orderReward}>
                  预估收益 ¥{typeof order.estimatedAmount === 'string' ? parseFloat(order.estimatedAmount) : order.estimatedAmount || 0}
                </Text>
                <TouchableOpacity
                  style={[styles.grabButton, grabbing === order.id && styles.grabButtonDisabled]}
                  onPress={() => handleGrab(order.id)}
                  disabled={grabbing === order.id}
                >
                  <Text style={styles.grabButtonText}>
                    {grabbing === order.id ? '抢单中...' : '立即抢单'}
                  </Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>

      {/* Quick Stats */}
      <View style={styles.quickStats}>
        <TouchableOpacity style={styles.quickStatItem} onPress={() => navigation.navigate('Stats')}>
          <Text style={styles.quickStatValue}>{stats.monthlyOrders}</Text>
          <Text style={styles.quickStatLabel}>本月订单</Text>
        </TouchableOpacity>
        <View style={styles.quickStatDivider} />
        <TouchableOpacity style={styles.quickStatItem} onPress={() => navigation.navigate('Stats')}>
          <Text style={styles.quickStatValue}>¥{stats.monthlyRevenue.toFixed(0)}</Text>
          <Text style={styles.quickStatLabel}>本月收益</Text>
        </TouchableOpacity>
        <View style={styles.quickStatDivider} />
        <View style={styles.quickStatItem}>
          <Text style={styles.quickStatValue}>{getCommissionText()}</Text>
          <Text style={styles.quickStatLabel}>当前等级</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  statusCard: { backgroundColor: '#fff', margin: 15, padding: 15, borderRadius: 12 },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusLabel: { fontSize: 14, color: '#666' },
  statusBadge: { backgroundColor: '#f0f0f0', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 15 },
  statusOnline: { backgroundColor: '#d9f7be' },
  statusText: { fontSize: 13 },
  statusButtons: { flexDirection: 'row', marginTop: 15, gap: 10 },
  statusButton: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#ddd', alignItems: 'center' },
  statusButtonActive: { borderColor: '#1890ff', backgroundColor: '#e6f7ff' },
  statusButtonText: { fontSize: 14, color: '#666' },
  statusButtonTextActive: { color: '#1890ff' },
  locationCard: { backgroundColor: '#fff', marginHorizontal: 15, padding: 15, borderRadius: 12, flexDirection: 'row', alignItems: 'center' },
  locationIcon: { fontSize: 30 },
  locationInfo: { flex: 1, marginLeft: 12 },
  locationText: { fontSize: 14, fontWeight: 'bold' },
  locationHint: { fontSize: 12, color: '#999', marginTop: 3 },
  refreshButton: { paddingHorizontal: 15, paddingVertical: 8, backgroundColor: '#1890ff', borderRadius: 15 },
  refreshText: { color: '#fff', fontSize: 12 },
  section: { margin: 15 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold' },
  sectionCount: { fontSize: 12, color: '#ff4d4f' },
  orderCard: { backgroundColor: '#fff', padding: 15, borderRadius: 12, marginBottom: 10 },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  orderType: { fontSize: 15, fontWeight: 'bold' },
  orderDistance: { fontSize: 12, color: '#ff4d4f' },
  orderAddress: { fontSize: 13, color: '#666', marginTop: 8 },
  orderFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  orderReward: { fontSize: 14, fontWeight: 'bold', color: '#52c41a' },
  grabButton: { backgroundColor: '#ff4d4f', paddingHorizontal: 20, paddingVertical: 8, borderRadius: 15 },
  grabButtonDisabled: { backgroundColor: '#ccc' },
  grabButtonText: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  quickStats: { backgroundColor: '#fff', margin: 15, padding: 15, borderRadius: 12, flexDirection: 'row' },
  quickStatItem: { flex: 1, alignItems: 'center' },
  quickStatValue: { fontSize: 18, fontWeight: 'bold', color: '#1890ff' },
  quickStatLabel: { fontSize: 12, color: '#999', marginTop: 5 },
  quickStatDivider: { width: 1, backgroundColor: '#f0f0f0' },
  emptyPool: { backgroundColor: '#fff', padding: 30, borderRadius: 12, alignItems: 'center' },
  emptyText: { color: '#999', fontSize: 14 },
});
