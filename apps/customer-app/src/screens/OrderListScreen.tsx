import React from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { WorkOrderListItem, WorkOrderStatus } from '@laser/shared';

const mockOrders: WorkOrderListItem[] = [
  {
    id: '1',
    orderNo: 'WX20260912001',
    faultType: '不出光',
    emergencyLevel: 3,
    status: WorkOrderStatus.REPAIRING,
    prepayAmount: 60,
    estimatedAmount: 200,
    createdAt: '2026-09-12T10:30:00Z',
    device: { model: '激光切割机 JC-5000', serialNumber: 'SN2023****XXX' },
    address: { province: '北京市', city: '朝阳区', detail: 'XX大厦 A座 101' },
  },
  {
    id: '2',
    orderNo: 'WX20260911003',
    faultType: '激光头清洗',
    emergencyLevel: 2,
    status: WorkOrderStatus.COMPLETED,
    prepayAmount: 45,
    estimatedAmount: 150,
    createdAt: '2026-09-11T14:20:00Z',
    device: { model: '激光焊接机 W-200', serialNumber: 'SN2024****YYY' },
    address: { province: '北京市', city: '海淀区', detail: 'XX产业园 B栋' },
  },
];

const getStatusLabel = (status: WorkOrderStatus) => {
  const labels: Record<WorkOrderStatus, string> = {
    [WorkOrderStatus.PENDING]: '待处理',
    [WorkOrderStatus.DISPATCHED]: '已派单',
    [WorkOrderStatus.CONFIRMED]: '已确认',
    [WorkOrderStatus.REPAIRING]: '维修中',
    [WorkOrderStatus.COMPLETED]: '已完成',
    [WorkOrderStatus.REFUSED]: '已拒绝',
    [WorkOrderStatus.CANCELLED]: '已取消',
  };
  return labels[status];
};

const getEmergencyLabel = (level: number) => {
  if (level >= 4) return '紧急';
  if (level >= 3) return '较急';
  return '普通';
};

export default function OrderListScreen({ navigation }: any) {
  const renderItem = ({ item }: { item: WorkOrderListItem }) => (
    <TouchableOpacity
      style={styles.orderCard}
      onPress={() => navigation.navigate('OrderDetail', { orderId: item.id })}
    >
      <View style={styles.orderHeader}>
        <View style={styles.emergencyBadge}>
          <Text style={styles.emergencyText}>
            {'●'.repeat(item.emergencyLevel)}
            {'○'.repeat(5 - item.emergencyLevel)}
          </Text>
          <Text style={styles.emergencyLabel}>{getEmergencyLabel(item.emergencyLevel)}</Text>
        </View>
        <Text style={styles.orderNo}>{item.orderNo}</Text>
        <Text style={styles.orderStatus}>{getStatusLabel(item.status)}</Text>
      </View>
      <Text style={styles.deviceModel}>{item.device?.model}</Text>
      <Text style={styles.faultType}>{item.faultType}</Text>
      <Text style={styles.address}>
        {item.address?.province}{item.address?.city}{item.address?.detail}
      </Text>
      <View style={styles.orderFooter}>
        <Text style={styles.date}>
          {new Date(item.createdAt).toLocaleDateString()}
        </Text>
        {item.status === WorkOrderStatus.COMPLETED && (
          <Text style={styles.rating}>⭐ 待评价</Text>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.filterBar}>
        {['全部', '待支付', '待上门', '维修中', '已完成'].map((tab, index) => (
          <TouchableOpacity key={tab} style={[styles.filterTab, index === 0 && styles.filterTabActive]}>
            <Text style={[styles.filterText, index === 0 && styles.filterTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <FlatList
        data={mockOrders}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>暂无订单</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  filterBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  filterTab: { paddingHorizontal: 12, paddingVertical: 5, marginHorizontal: 3 },
  filterTabActive: { backgroundColor: '#1890ff', borderRadius: 15 },
  filterText: { fontSize: 14, color: '#666' },
  filterTextActive: { color: '#fff' },
  list: { padding: 15 },
  orderCard: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
  },
  orderHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  emergencyBadge: { flexDirection: 'row', alignItems: 'center' },
  emergencyText: { fontSize: 10, color: '#ff4d4f' },
  emergencyLabel: { fontSize: 12, color: '#ff4d4f', marginLeft: 5 },
  orderNo: { flex: 1, fontSize: 14, color: '#666', marginLeft: 10 },
  orderStatus: { fontSize: 14, color: '#1890ff' },
  deviceModel: { fontSize: 14, fontWeight: 'bold' },
  faultType: { fontSize: 13, color: '#666', marginTop: 3 },
  address: { fontSize: 12, color: '#999', marginTop: 3 },
  orderFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  date: { fontSize: 12, color: '#999' },
  rating: { fontSize: 12, color: '#faad14' },
  empty: { textAlign: 'center', marginTop: 50, color: '#999' },
});
