import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput } from 'react-native';

export default function DeviceScanScreen({ navigation }: any) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>请选择设备识别方式</Text>

      <View style={styles.scanBox}>
        <Text style={styles.scanIcon}>📷</Text>
        <Text style={styles.scanText}>扫描设备二维码</Text>
        <TouchableOpacity style={styles.scanButton}>
          <Text style={styles.scanButtonText}>开始扫描</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.divider}>
        <Text style={styles.dividerText}>或</Text>
      </View>

      <View style={styles.inputBox}>
        <Text style={styles.label}>序列号/设备码</Text>
        <TextInput
          style={styles.input}
          placeholder="请输入序列号"
          placeholderTextColor="#999"
        />
        <TouchableOpacity style={styles.queryButton}>
          <Text style={styles.queryButtonText}>查询</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.history}>
        <Text style={styles.historyTitle}>从历史设备选择</Text>
        <TouchableOpacity style={styles.historyItem}>
          <Text style={styles.historyIcon}>🖥</Text>
          <View style={styles.historyInfo}>
            <Text style={styles.historyModel}>激光切割机 JC-5000</Text>
            <Text style={styles.historySerial}>SN2023****XXX</Text>
          </View>
          <Text style={styles.historyArrow}>→</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.historyItem}>
          <Text style={styles.historyIcon}>🖥</Text>
          <View style={styles.historyInfo}>
            <Text style={styles.historyModel}>激光焊接机 W-200</Text>
            <Text style={styles.historySerial}>SN2024****YYY</Text>
          </View>
          <Text style={styles.historyArrow}>→</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', padding: 20 },
  title: { fontSize: 16, color: '#666', textAlign: 'center', marginBottom: 20 },
  scanBox: {
    backgroundColor: '#fff',
    padding: 30,
    borderRadius: 12,
    alignItems: 'center',
  },
  scanIcon: { fontSize: 60 },
  scanText: { fontSize: 16, marginTop: 10 },
  scanButton: {
    backgroundColor: '#1890ff',
    paddingHorizontal: 30,
    paddingVertical: 10,
    borderRadius: 20,
    marginTop: 15,
  },
  scanButtonText: { color: '#fff', fontSize: 14 },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 20 },
  dividerText: { color: '#999', backgroundColor: '#f5f5f5', paddingHorizontal: 20 },
  inputBox: { backgroundColor: '#fff', padding: 15, borderRadius: 12 },
  label: { fontSize: 14, color: '#666' },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginTop: 10,
    fontSize: 14,
  },
  queryButton: {
    backgroundColor: '#1890ff',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 15,
  },
  queryButtonText: { color: '#fff', fontSize: 14 },
  history: { marginTop: 20 },
  historyTitle: { fontSize: 14, color: '#666', marginBottom: 10 },
  historyItem: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  historyIcon: { fontSize: 30 },
  historyInfo: { flex: 1, marginLeft: 15 },
  historyModel: { fontSize: 14, fontWeight: 'bold' },
  historySerial: { fontSize: 12, color: '#999', marginTop: 3 },
  historyArrow: { fontSize: 20, color: '#999' },
});
