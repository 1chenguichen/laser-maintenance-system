import React from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity } from 'react-native';

export default function RefundScreen({ route, navigation }: any) {
  return (
    <View style={styles.container}>
      <View style={styles.orderInfo}>
        <Text style={styles.orderNo}>WX20260912001</Text>
        <Text style={styles.deviceModel}>激光切割机 JC-5000</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>退款原因</Text>
        <TextInput
          style={styles.textArea}
          placeholder="请详细描述退款原因..."
          multiline
          numberOfLines={4}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>退款金额</Text>
        <View style={styles.amountInput}>
          <Text style={styles.currency}>¥</Text>
          <TextInput
            style={styles.amount}
            placeholder="0.00"
            keyboardType="decimal-pad"
          />
        </View>
        <Text style={styles.hint}>最高可退: ¥60</Text>
      </View>

      <TouchableOpacity style={styles.submitButton}>
        <Text style={styles.submitButtonText}>提交退款申请</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', padding: 15 },
  orderInfo: { backgroundColor: '#fff', padding: 15, borderRadius: 8 },
  orderNo: { fontSize: 14, color: '#666' },
  deviceModel: { fontSize: 16, fontWeight: 'bold', marginTop: 5 },
  section: { backgroundColor: '#fff', marginTop: 15, padding: 15, borderRadius: 8 },
  label: { fontSize: 14, fontWeight: 'bold' },
  textArea: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    height: 100,
    marginTop: 10,
    textAlignVertical: 'top',
  },
  amountInput: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  currency: { fontSize: 24, fontWeight: 'bold' },
  amount: { fontSize: 24, fontWeight: 'bold', marginLeft: 5, flex: 1 },
  hint: { fontSize: 12, color: '#999', marginTop: 10 },
  submitButton: {
    backgroundColor: '#ff4d4f',
    marginTop: 20,
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
