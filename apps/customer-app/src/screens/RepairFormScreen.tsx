import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput } from 'react-native';
import { FAULT_TYPES } from '@laser/shared';

export default function RepairFormScreen({ route, navigation }: any) {
  const faultTypes = Object.entries(FAULT_TYPES);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.deviceCard}>
        <Text style={styles.deviceIcon}>🖥</Text>
        <View>
          <Text style={styles.deviceModel}>激光切割机 JC-5000</Text>
          <Text style={styles.deviceSerial}>SN2023****XXX</Text>
          <Text style={styles.deviceWarranty}>保修期内 ✓</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>故障类型（请选择）</Text>
        <View style={styles.faultGrid}>
          {faultTypes.map(([key, label]) => (
            <TouchableOpacity key={key} style={styles.faultItem}>
              <Text style={styles.faultText}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>故障描述（选填）</Text>
        <TextInput
          style={styles.textArea}
          placeholder="描述一下具体问题..."
          multiline
          numberOfLines={4}
        />
        <TouchableOpacity style={styles.photoButton}>
          <Text style={styles.photoButtonText}>📷 添加照片/视频</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>上门地址</Text>
        <TouchableOpacity style={styles.addressCard}>
          <Text style={styles.addressText}>📍 北京朝阳区XX大厦 A座 101室</Text>
          <Text style={styles.addressArrow}>▼</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>是否有熟悉的工程师？</Text>
        <View style={styles.engineerChoice}>
          <TouchableOpacity style={[styles.choiceButton, styles.choiceButtonActive]}>
            <Text style={[styles.choiceText, styles.choiceTextActive]}>否</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.choiceButton}>
            <Text style={styles.choiceText}>是</Text>
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity
        style={styles.submitButton}
        onPress={() => navigation.navigate('Payment', { orderId: 'new' })}
      >
        <Text style={styles.submitButtonText}>提交报修单</Text>
        <Text style={styles.submitHint}>预估费用 ¥200 定金 ¥60</Text>
      </TouchableOpacity>
    </ScrollView>
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
  },
  deviceIcon: { fontSize: 40 },
  deviceModel: { fontSize: 16, fontWeight: 'bold' },
  deviceSerial: { fontSize: 13, color: '#999', marginTop: 3 },
  deviceWarranty: { fontSize: 13, color: '#52c41a', marginTop: 3 },
  section: { backgroundColor: '#fff', margin: 15, marginBottom: 0, padding: 15, borderRadius: 8 },
  sectionTitle: { fontSize: 14, fontWeight: 'bold', marginBottom: 12 },
  faultGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  faultItem: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    backgroundColor: '#f5f5f5',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  faultText: { fontSize: 13 },
  textArea: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    height: 100,
    textAlignVertical: 'top',
  },
  photoButton: {
    borderWidth: 1,
    borderColor: '#1890ff',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  photoButtonText: { color: '#1890ff', fontSize: 14 },
  addressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
  },
  addressText: { flex: 1, fontSize: 14 },
  addressArrow: { color: '#999' },
  engineerChoice: { flexDirection: 'row', gap: 10 },
  choiceButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  choiceButtonActive: { borderColor: '#1890ff', backgroundColor: '#e6f7ff' },
  choiceText: { fontSize: 14 },
  choiceTextActive: { color: '#1890ff' },
  submitButton: {
    backgroundColor: '#1890ff',
    margin: 15,
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  submitHint: { color: '#fff', fontSize: 12, marginTop: 5, opacity: 0.8 },
});
