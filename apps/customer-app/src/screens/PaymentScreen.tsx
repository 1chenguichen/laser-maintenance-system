import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export default function PaymentScreen({ route, navigation }: any) {
  return (
    <View style={styles.container}>
      <View style={styles.orderCard}>
        <Text style={styles.orderTitle}>订单待支付</Text>
        <Text style={styles.orderNo}>订单编号: WX20260912001</Text>
        <View style={styles.deviceInfo}>
          <Text style={styles.deviceIcon}>🔧</Text>
          <View>
            <Text style={styles.deviceModel}>激光切割机 JC-5000</Text>
            <Text style={styles.deviceFault}>故障: 不出光</Text>
            <Text style={styles.deviceAddress}>
              设备地址: 北京朝阳区XX大厦 A座 101室
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.amountCard}>
        <View style={styles.amountRow}>
          <Text style={styles.amountLabel}>预估费用</Text>
          <Text style={styles.amountValue}>¥200</Text>
        </View>
        <View style={styles.amountRow}>
          <Text style={styles.amountLabel}>定金比例</Text>
          <Text style={styles.amountValue}>30%</Text>
        </View>
        <View style={[styles.amountRow, styles.amountDivider]}>
          <Text style={styles.amountTotal}>应付定金</Text>
          <Text style={styles.amountTotalValue}>¥60</Text>
        </View>
      </View>

      <View style={styles.paymentCard}>
        <Text style={styles.paymentTitle}>支付方式</Text>
        <TouchableOpacity style={[styles.paymentItem, styles.paymentItemActive]}>
          <Text style={styles.paymentIcon}>💚</Text>
          <Text style={styles.paymentName}>微信支付</Text>
          <Text style={styles.paymentRadio}>◉</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.paymentItem}>
          <Text style={styles.paymentIcon}>💙</Text>
          <Text style={styles.paymentName}>支付宝</Text>
          <Text style={styles.paymentRadio}>○</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.payButton}>
        <Text style={styles.payButtonText}>立即支付 ¥60</Text>
      </TouchableOpacity>

      <Text style={styles.hint}>⚠️ 支付后如需取消，24小时内可全额退款</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', padding: 15 },
  orderCard: { backgroundColor: '#fff', padding: 20, borderRadius: 12 },
  orderTitle: { fontSize: 18, fontWeight: 'bold' },
  orderNo: { fontSize: 13, color: '#666', marginTop: 5 },
  deviceInfo: { flexDirection: 'row', marginTop: 15 },
  deviceIcon: { fontSize: 40 },
  deviceModel: { fontSize: 15, fontWeight: 'bold' },
  deviceFault: { fontSize: 13, color: '#666', marginTop: 5 },
  deviceAddress: { fontSize: 12, color: '#999', marginTop: 3 },
  amountCard: { backgroundColor: '#fff', marginTop: 15, padding: 20, borderRadius: 12 },
  amountRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  amountLabel: { fontSize: 14, color: '#666' },
  amountValue: { fontSize: 14 },
  amountDivider: { borderTopWidth: 1, borderTopColor: '#f0f0f0', paddingTop: 15, marginTop: 15 },
  amountTotal: { fontSize: 16, fontWeight: 'bold' },
  amountTotalValue: { fontSize: 20, fontWeight: 'bold', color: '#ff4d4f' },
  paymentCard: { backgroundColor: '#fff', marginTop: 15, padding: 20, borderRadius: 12 },
  paymentTitle: { fontSize: 16, fontWeight: 'bold' },
  paymentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  paymentItemActive: { borderColor: '#1890ff' },
  paymentIcon: { fontSize: 24 },
  paymentName: { flex: 1, fontSize: 14, marginLeft: 15 },
  paymentRadio: { fontSize: 20, color: '#ddd' },
  payButton: {
    backgroundColor: '#1890ff',
    marginTop: 20,
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  payButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  hint: { fontSize: 12, color: '#999', textAlign: 'center', marginTop: 15 },
});
