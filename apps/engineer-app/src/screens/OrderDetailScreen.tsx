import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Linking, TextInput, Image, Modal } from 'react-native';
import { WorkOrderStatus } from '../types';
import { getOrderDetail, startRepair, completeRepair } from '../api';

export default function OrderDetailScreen({ route, navigation }: any) {
  const { orderId } = route.params;
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [photos, setPhotos] = useState<string[]>([]);
  const [report, setReport] = useState('');
  const [showSignature, setShowSignature] = useState(false);
  const [signature, setSignature] = useState('');

  useEffect(() => {
    loadOrder();
  }, [orderId]);

  const loadOrder = async () => {
    try {
      const data = await getOrderDetail(orderId);
      setOrder(data);
    } catch (e: any) {
      Alert.alert('加载失败', e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStart = async () => {
    try {
      await startRepair(orderId);
      Alert.alert('已开始服务', '请准时上门维修');
      loadOrder();
    } catch (e: any) {
      Alert.alert('操作失败', e.message);
    }
  };

  const handleComplete = async () => {
    if (!report.trim()) {
      Alert.alert('请填写维修报告');
      return;
    }
    Alert.alert(
      '确认完成',
      '确定要完成这个订单吗？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确定',
          onPress: async () => {
            try {
              await completeRepair(orderId, {
                report: report || '维修完成',
                signature: signature || undefined,
                photos: photos.length > 0 ? photos : undefined
              });
              Alert.alert('操作成功', '订单已完成');
              navigation.goBack();
            } catch (e: any) {
              Alert.alert('操作失败', e.message);
            }
          },
        },
      ]
    );
  };

  const handleTakePhoto = () => {
    // 模拟拍照 - 实际项目中需要使用 expo-image-picker
    const mockPhoto = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    setPhotos([...photos, mockPhoto]);
  };

  const handleClearSignature = () => {
    setSignature('');
  };

  const handleNavigate = () => {
    if (order?.address?.latitude && order?.address?.longitude) {
      const url = `https://maps.google.com/?q=${order.address.latitude},${order.address.longitude}`;
      Linking.openURL(url).catch(() => {
        Alert.alert('无法打开地图', '请安装地图应用');
      });
    } else {
      const address = order?.address ? `${order.address.province}${order.address.city}${order.address.district}${order.address.detail}` : '';
      const url = `https://maps.google.com/?q=${encodeURIComponent(address)}`;
      Linking.openURL(url).catch(() => {
        Alert.alert('无法打开地图', '请安装地图应用');
      });
    }
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <Text>加载中...</Text>
      </View>
    );
  }

  if (!order) {
    return (
      <View style={styles.loading}>
        <Text>订单不存在</Text>
      </View>
    );
  }

  const statusText: Record<string, string> = {
    [WorkOrderStatus.PENDING]: '待处理',
    [WorkOrderStatus.DISPATCHED]: '已派单',
    [WorkOrderStatus.CONFIRMED]: '已确认',
    [WorkOrderStatus.REPAIRING]: '服务中',
    [WorkOrderStatus.COMPLETED]: '已完成',
    [WorkOrderStatus.REFUSED]: '已拒绝',
    [WorkOrderStatus.CANCELLED]: '已取消',
  };

  return (
    <ScrollView style={styles.container}>
      {/* Status */}
      <View style={[styles.statusBanner, order.status === WorkOrderStatus.COMPLETED && styles.statusCompleted]}>
        <Text style={styles.statusText}>状态: {statusText[order.status] || order.status}</Text>
        <Text style={styles.orderNo}>{order.orderNo}</Text>
      </View>

      {/* Customer Info */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>👤 客户信息</Text>
        <View style={styles.infoRow}>
          <Text style={styles.label}>姓名</Text>
          <Text style={styles.value}>{order.customer?.name || '匿名'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.label}>电话</Text>
          <Text style={[styles.value, { color: '#1890ff' }]}>{order.customer?.phone || '-'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.label}>地址</Text>
          <Text style={styles.value}>
            {order.address ? `${order.address.province}${order.address.city}${order.address.district}${order.address.detail}` : '-'}
          </Text>
        </View>
      </View>

      {/* Device Info */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🖥 设备信息</Text>
        <View style={styles.infoRow}>
          <Text style={styles.label}>设备型号</Text>
          <Text style={styles.value}>{order.device?.model || '-'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.label}>序列号</Text>
          <Text style={styles.value}>{order.device?.serialNumber || '-'}</Text>
        </View>
      </View>

      {/* Fault Info */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🔧 故障信息</Text>
        <View style={styles.infoRow}>
          <Text style={styles.label}>故障类型</Text>
          <Text style={[styles.value, { color: '#ff4d4f' }]}>{order.faultType || '-'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.label}>故障描述</Text>
          <Text style={styles.value}>{order.faultDescription || '-'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.label}>紧急程度</Text>
          <Text style={styles.value}>
            {order.emergencyLevel >= 4 ? '🔥 紧急' : order.emergencyLevel >= 3 ? '⚠️ 高' : '普通'}
          </Text>
        </View>
      </View>

      {/* Location */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>📍 上门地址</Text>
        <Text style={styles.address}>
          {order.address ? `${order.address.province}${order.address.city}${order.address.district}${order.address.detail}` : '暂无地址'}
        </Text>
        <TouchableOpacity style={styles.navButton} onPress={handleNavigate}>
          <Text style={styles.navButtonText}>🗺️ 导航到此处</Text>
        </TouchableOpacity>
      </View>

      {/* Quote */}
      <View style={styles.quoteCard}>
        <Text style={styles.quoteTitle}>💰 费用信息</Text>
        <View style={styles.quoteRow}>
          <Text style={styles.quoteLabel}>预估费用</Text>
          <Text style={styles.quoteValue}>¥{order.estimatedAmount || 0}</Text>
        </View>
        {order.prepayAmount ? (
          <View style={styles.quoteRow}>
            <Text style={styles.quoteLabel}>已付定金</Text>
            <Text style={[styles.quoteValue, { color: '#52c41a' }]}>¥{order.prepayAmount}</Text>
          </View>
        ) : null}
      </View>

      {/* Actions */}
      {(order.status === WorkOrderStatus.DISPATCHED || order.status === WorkOrderStatus.CONFIRMED) && (
        <View style={styles.actions}>
          <TouchableOpacity style={styles.startButton} onPress={handleStart}>
            <Text style={styles.startButtonText}>🔧 开始服务</Text>
          </TouchableOpacity>
        </View>
      )}

      {order.status === WorkOrderStatus.REPAIRING && (
        <View style={styles.repairForm}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>📷 现场照片</Text>
            <ScrollView horizontal style={styles.photoScroll}>
              {photos.map((photo, index) => (
                <Image key={index} source={{ uri: photo }} style={styles.photoThumb} />
              ))}
              <TouchableOpacity style={styles.photoAdd} onPress={handleTakePhoto}>
                <Text style={styles.photoAddText}>+ 拍照</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>📝 维修报告</Text>
            <TextInput
              style={styles.reportInput}
              placeholder="请填写维修报告..."
              value={report}
              onChangeText={setReport}
              multiline
              rows={3}
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>✍️ 客户签名</Text>
            <TouchableOpacity style={styles.signatureBox} onPress={() => setShowSignature(true)}>
              {signature ? (
                <Image source={{ uri: signature }} style={styles.signatureImg} />
              ) : (
                <Text style={styles.signaturePlaceholder}>点击签名</Text>
              )}
            </TouchableOpacity>
            {signature ? (
              <TouchableOpacity onPress={handleClearSignature}>
                <Text style={styles.clearSigText}>清除签名</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.completeButton} onPress={handleComplete}>
              <Text style={styles.completeButtonText}>✅ 确认完成服务</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  statusBanner: { backgroundColor: '#1890ff', padding: 15, flexDirection: 'row', justifyContent: 'space-between' },
  statusCompleted: { backgroundColor: '#52c41a' },
  statusText: { color: '#fff', fontSize: 14 },
  orderNo: { color: '#fff', fontSize: 14 },
  card: { backgroundColor: '#fff', margin: 15, marginBottom: 0, padding: 15, borderRadius: 12 },
  cardTitle: { fontSize: 15, fontWeight: 'bold', marginBottom: 12 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  label: { fontSize: 13, color: '#999' },
  value: { fontSize: 13, maxWidth: '60%', textAlign: 'right' },
  address: { fontSize: 14, color: '#666' },
  navButton: { backgroundColor: '#e6f7ff', padding: 10, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  navButtonText: { color: '#1890ff', fontSize: 14 },
  actions: { margin: 15 },
  startButton: { backgroundColor: '#1890ff', padding: 15, borderRadius: 8, alignItems: 'center' },
  startButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  completeButton: { backgroundColor: '#52c41a', padding: 15, borderRadius: 8, alignItems: 'center' },
  completeButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  quoteCard: { backgroundColor: '#fff', margin: 15, padding: 15, borderRadius: 12 },
  quoteTitle: { fontSize: 15, fontWeight: 'bold', marginBottom: 12 },
  quoteRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  quoteLabel: { fontSize: 13, color: '#666' },
  quoteValue: { fontSize: 14, fontWeight: 'bold' },
  repairForm: { marginTop: 0 },
  photoScroll: { flexDirection: 'row', marginTop: 10 },
  photoThumb: { width: 80, height: 80, borderRadius: 8, marginRight: 10 },
  photoAdd: { width: 80, height: 80, borderRadius: 8, borderWidth: 1, borderColor: '#ddd', borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center' },
  photoAddText: { fontSize: 12, color: '#999' },
  reportInput: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, fontSize: 14, marginTop: 10, minHeight: 80, textAlignVertical: 'top' },
  signatureBox: { height: 120, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginTop: 10, backgroundColor: '#fafafa' },
  signaturePlaceholder: { color: '#999', fontSize: 14 },
  signatureImg: { width: '100%', height: '100%', resizeMode: 'contain' },
  clearSigText: { textAlign: 'center', color: '#ff4d4f', fontSize: 13, marginTop: 10 },
});
