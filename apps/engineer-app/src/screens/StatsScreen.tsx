import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { getEngineerStats } from '../api';

const TIER_INFO = [
  { tier: 1, range: '1-10单', rate: '20%', min: 1, max: 10, color: '#999' },
  { tier: 2, range: '11-30单', rate: '25%', min: 11, max: 30, color: '#1890ff' },
  { tier: 3, range: '31+单', rate: '30%', min: 31, max: Infinity, color: '#52c41a' },
];

export default function StatsScreen() {
  const [stats, setStats] = useState({
    monthlyOrders: 0,
    monthlyRevenue: 0,
    commissionRate: 0.2,
    totalOrders: 0,
    totalRevenue: 0,
  });

  // API 返回格式：{ currentMonth: { orderCount, revenue, commissionRate, ... }, history: { totalOrders, totalRevenue, ... } }
  const [rawStats, setRawStats] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadStats = async () => {
    try {
      const data = await getEngineerStats();
      setRawStats(data);
      // 转换 API 格式到 UI 需要的格式
      setStats({
        monthlyOrders: data.currentMonth?.orderCount || 0,
        monthlyRevenue: data.currentMonth?.revenue || 0,
        commissionRate: data.currentMonth?.commissionRate || 0.2,
        totalOrders: data.history?.totalOrders || 0,
        totalRevenue: data.history?.totalRevenue || 0,
      });
    } catch (e) {
      console.error('Load stats error:', e);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadStats();
    setRefreshing(false);
  };

  const currentTier = TIER_INFO.find((t) => stats.monthlyOrders >= t.min && stats.monthlyOrders <= t.max) || TIER_INFO[0];
  const nextTier = TIER_INFO.find((t) => t.min > stats.monthlyOrders);
  const progressPercent = nextTier
    ? ((stats.monthlyOrders - currentTier.min + 1) / (currentTier.max - currentTier.min + 1)) * 100
    : 100;

  const commission = stats.monthlyRevenue * stats.commissionRate;

  return (
    <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      {/* Summary Card */}
      <View style={styles.summaryCard}>
        <Text style={styles.monthLabel}>2026年9月</Text>
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{stats.monthlyOrders}</Text>
            <Text style={styles.summaryLabel}>完成订单</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>¥{stats.monthlyRevenue.toFixed(0)}</Text>
            <Text style={styles.summaryLabel}>总收入</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: '#ffd700' }]}>¥{commission.toFixed(0)}</Text>
            <Text style={styles.summaryLabel}>我的收益</Text>
          </View>
        </View>
      </View>

      {/* Commission Tier */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>📊 提成等级</Text>
        <View style={styles.tierProgress}>
          {nextTier ? (
            <Text style={styles.tierText}>
              再完成{Math.max(0, nextTier.min - stats.monthlyOrders)}单可升至{nextTier.rate}提成等级
            </Text>
          ) : (
            <Text style={styles.tierText}>已达成最高提成等级！</Text>
          )}
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${Math.min(100, progressPercent)}%` }]} />
          </View>
          <Text style={styles.tierHint}>当前: {currentTier.range} · {currentTier.rate}提成</Text>
        </View>

        <View style={styles.tierTable}>
          {TIER_INFO.map((tier) => (
            <View
              key={tier.tier}
              style={[styles.tierRow, tier.tier === currentTier.tier && styles.tierRowActive]}
            >
              <Text style={styles.tierRange}>{tier.range}</Text>
              <Text style={[styles.tierRate, { color: tier.color }]}>{tier.rate}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* All-time Stats */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>📈 累计统计</Text>
        <View style={styles.allTimeRow}>
          <View style={styles.allTimeItem}>
            <Text style={styles.allTimeValue}>{stats.totalOrders}</Text>
            <Text style={styles.allTimeLabel}>累计订单</Text>
          </View>
          <View style={styles.allTimeItem}>
            <Text style={styles.allTimeValue}>¥{stats.totalRevenue.toFixed(0)}</Text>
            <Text style={styles.allTimeLabel}>累计收益</Text>
          </View>
        </View>
      </View>

      {/* Withdraw */}
      <TouchableOpacity style={styles.withdrawButton}>
        <Text style={styles.withdrawButtonText}>💰 立即提现</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  summaryCard: { backgroundColor: '#1890ff', margin: 15, padding: 20, borderRadius: 12 },
  monthLabel: { color: '#fff', fontSize: 14, textAlign: 'center' },
  summaryRow: { flexDirection: 'row', marginTop: 15 },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  summaryLabel: { fontSize: 12, color: '#fff', opacity: 0.8, marginTop: 5 },
  summaryDivider: { width: 1, backgroundColor: '#fff', opacity: 0.3 },
  card: { backgroundColor: '#fff', margin: 15, marginTop: 0, padding: 15, borderRadius: 12 },
  cardTitle: { fontSize: 15, fontWeight: 'bold', marginBottom: 12 },
  tierProgress: { marginBottom: 15 },
  tierText: { fontSize: 13, color: '#666' },
  progressBar: { height: 8, backgroundColor: '#f0f0f0', borderRadius: 4, marginVertical: 10 },
  progressFill: { height: 8, backgroundColor: '#1890ff', borderRadius: 4 },
  tierHint: { fontSize: 12, color: '#999' },
  tierTable: { gap: 8 },
  tierRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 10, borderRadius: 8, backgroundColor: '#f5f5f5' },
  tierRowActive: { backgroundColor: '#e6f7ff', borderWidth: 1, borderColor: '#1890ff' },
  tierRange: { fontSize: 13 },
  tierRate: { fontSize: 14, fontWeight: 'bold' },
  allTimeRow: { flexDirection: 'row' },
  allTimeItem: { flex: 1, alignItems: 'center' },
  allTimeValue: { fontSize: 18, fontWeight: 'bold', color: '#1890ff' },
  allTimeLabel: { fontSize: 12, color: '#999', marginTop: 5 },
  withdrawButton: { backgroundColor: '#52c41a', margin: 15, padding: 15, borderRadius: 8, alignItems: 'center' },
  withdrawButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
