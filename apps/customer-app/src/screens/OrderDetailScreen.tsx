import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { WorkOrderStatus } from '@laser/shared';

export default function OrderDetailScreen({ route, navigation }: any) {
  const { orderId } = route.params;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.statusCard}>
        <Text style={styles.orderNo}>WX20260912001</Text>
        <Text style={styles.status}>维修中</Text>
        <View style={styles.timeline}>
          <Text style={styles.timelineItem}>✓ 2026-09-12 10:30 提交报修</Text>
          <Text style={styles.timelineItem}>✓ 2026-09-12 10:35 客服已分类</Text>
          <Text style={styles.timelineItem}>✓ 2026-09-12 10:40 工程师接单</Text>
          <Text style={styles.timelineItem}>○ 2026-09-12 14:00 上门维修</Text>
          <Text style={styles.timelineItem}>○ 2026-09-12 15:00 维修完成</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>设备信息</Text>
        <Text style={styles.info}>激光切割机 JC-5000</Text>
        <Text style={styles.info}>故障: 不出光</Text>
        <Text style={styles.info}>地址: 北京朝阳区XX大厦 A座 101室</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>工程师信息</Text>
        <Text style={styles.info}>张师傅 ⭐4.8</Text>
        <TouchableOpacity style={styles.callButton}>
          <Text style={styles.callButtonText}>📞 138****1234</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>费用信息</Text>
        <View style={styles.feeRow}>
          <Text>预估费用</Text>
          <Text>¥200</Text>
        </View>
        <View style={styles.feeRow}>
          <Text>定金已付</Text>
          <Text>¥60 (30%)</Text>
        </View>
        <View style={[styles.feeRow, styles.feeRowBold]}>
          <Text>待结清</Text>
          <Text>¥140</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.refundButton}
          onPress={() => navigation.navigate('Refund', { orderId })}
        >
          <Text style={styles.refundButtonText}>申请退款</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.csButton}>
          <Text style={styles.csButtonText}>联系客服</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  statusCard: { backgroundColor: '#1890ff', padding: 20 },
  orderNo: { color: '#fff', fontSize: 16 },
  status: { color: '#fff', fontSize: 24, fontWeight: 'bold', marginTop: 5 },
  timeline: { marginTop: 15 },
  timelineItem: { color: '#fff', fontSize: 13, marginTop: 5, opacity: 0.8 },
  card: { backgroundColor: '#fff', margin: 15, padding: 15, borderRadius: 8 },
  cardTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 10 },
  info: { fontSize: 14, color: '#666', marginTop: 5 },
  callButton: {
    backgroundColor: '#e6f7ff',
    padding: 10,
    borderRadius: 8,
    marginTop: 10,
    alignItems: 'center',
  },
  callButtonText: { color: '#1890ff', fontSize: 14 },
  feeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  feeRowBold: { borderTop: '1px solid #f0f0f0', paddingTop: 10, marginTop: 10 },
  actions: { flexDirection: 'row', padding: 15, gap: 10 },
  refundButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ff4d4f',
    alignItems: 'center',
  },
  refundButtonText: { color: '#ff4d4f', fontSize: 14 },
  csButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#1890ff',
    alignItems: 'center',
  },
  csButtonText: { color: '#fff', fontSize: 14 },
});
