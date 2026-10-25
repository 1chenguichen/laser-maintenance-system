import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { WorkOrderStatus } from '../types';
import { getMyOrders, WorkOrderListItem } from '../api';

const STATUS_TEXT: Record<string, string> = {
  [WorkOrderStatus.PENDING]: '待处理',
  [WorkOrderStatus.DISPATCHED]: '已派单',
  [WorkOrderStatus.CONFIRMED]: '已确认',
  [WorkOrderStatus.REPAIRING]: '服务中',
  [WorkOrderStatus.COMPLETED]: '已完成',
  [WorkOrderStatus.REFUSED]: '已拒绝',
  [WorkOrderStatus.CANCELLED]: '已取消',
};

const STATUS_COLOR: Record<string, string> = {
  [WorkOrderStatus.PENDING]: '#faad14',
  [WorkOrderStatus.DISPATCHED]: '#1890ff',
  [WorkOrderStatus.CONFIRMED]: '#52c41a',
  [WorkOrderStatus.REPAIRING]: '#1890ff',
  [WorkOrderStatus.COMPLETED]: '#999',
  [WorkOrderStatus.REFUSED]: '#ff4d4f',
  [WorkOrderStatus.CANCELLED]: '#ff4d4f',
};

const TABS = ['全部', '服务中', '待处理', '已完成'];

export default function OrderListScreen({ navigation }: any) {
  const [orders, setOrders] = useState<WorkOrderListItem[]>([]);
  const [filter, setFilter] = useState('全部');
  const [refreshing, setRefreshing] = useState(false);

  const loadOrders = useCallback(async () => {
    try {
      const data = await getMyOrders();
      setOrders(data || []);
    } catch (e) {
      console.error('Load orders error:', e);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadOrders();
    setRefreshing(false);
  };

  const filtered = orders.filter((o) => {
    if (filter === '全部') return true;
    if (filter === '服务中') return o.status === WorkOrderStatus.REPAIRING || o.status === WorkOrderStatus.CONFIRMED;
    if (filter === '待处理') return o.status === WorkOrderStatus.DISPATCHED || o.status === WorkOrderStatus.PENDING;
    if (filter === '已完成') return o.status === WorkOrderStatus.COMPLETED;
    return true;
  });

  const renderItem = ({ item }: { item: WorkOrderListItem }) => (
    <TouchableOpacity
      style={styles.orderCard}
      onPress={() => navigation.navigate('OrderDetail', { orderId: item.id })}
    >
      <View style={styles.orderHeader}>
        <Text style={styles.orderNo}>{item.orderNo}</Text>
        <View style={[styles.statusBadge, { backgroundColor: (STATUS_COLOR[item.status] || '#999') + '20' }]}>
          <Text style={[styles.statusText, { color: STATUS_COLOR[item.status] || '#999' }]}>
            {STATUS_TEXT[item.status] || item.status}
          </Text>
        </View>
      </View>
      <Text style={styles.device}>{item.device?.model || '设备信息'}</Text>
      <Text style={styles.fault}>故障: {item.faultType}</Text>
      <Text style={styles.address}>
        📍 {item.address ? `${item.address.city}${item.address.district}${item.address.detail}` : '地址待确认'}
      </Text>
      <View style={styles.orderFooter}>
        <Text style={styles.time}>{new Date(item.createdAt).toLocaleDateString('zh-CN')}</Text>
        <Text style={styles.amount}>预估 ¥{item.estimatedAmount || 0}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.filterTabs}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.filterTab, filter === tab && styles.filterTabActive]}
            onPress={() => setFilter(tab)}
          >
            <Text style={[styles.filterText, filter === tab && styles.filterTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={<Text style={styles.empty}>暂无订单</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  filterTabs: { backgroundColor: '#fff', flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 15 },
  filterTab: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  filterTabActive: { borderBottomWidth: 2, borderBottomColor: '#1890ff' },
  filterText: { fontSize: 14, color: '#666' },
  filterTextActive: { color: '#1890ff', fontWeight: 'bold' },
  orderCard: { backgroundColor: '#fff', margin: 15, marginTop: 5, padding: 15, borderRadius: 12 },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderNo: { fontSize: 14, fontWeight: 'bold' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  statusText: { fontSize: 12, fontWeight: 'bold' },
  device: { fontSize: 15, fontWeight: 'bold', marginTop: 10 },
  fault: { fontSize: 13, color: '#ff4d4f', marginTop: 5 },
  address: { fontSize: 13, color: '#666', marginTop: 5 },
  orderFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  time: { fontSize: 12, color: '#999' },
  amount: { fontSize: 16, fontWeight: 'bold', color: '#52c41a' },
  empty: { textAlign: 'center', marginTop: 50, color: '#999' },
});
