import React, { useState, useEffect } from 'react';
import { getStats, getTrendStats, getPerformanceStats, getEngineerRanking, getComplaintRate, TrendStats, PerformanceStats, EngineerRanking, ComplaintRate, Stats as StatsType } from '../api';

export default function Stats() {
  const [stats, setStats] = useState<StatsType | null>(null);
  const [trend, setTrend] = useState<TrendStats | null>(null);
  const [performance, setPerformance] = useState<PerformanceStats | null>(null);
  const [ranking, setRanking] = useState<EngineerRanking[]>([]);
  const [complaintRate, setComplaintRate] = useState<ComplaintRate | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [statsData, trendData, perfData, rankingData, complaintData] = await Promise.all([
        getStats(),
        getTrendStats(),
        getPerformanceStats(),
        getEngineerRanking(),
        getComplaintRate(),
      ]);
      setStats(statsData);
      setTrend(trendData);
      setPerformance(perfData);
      setRanking(rankingData || []);
      setComplaintRate(complaintData);
    } catch (err) {
      console.error('Failed to load stats:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="card"><div className="loading">加载中...</div></div>;
  }

  return (
    <div>
      {/* 核心指标卡片 */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{stats?.totalOrders || 0}</div>
          <div className="stat-label">工单总数</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats?.pendingOrders || 0}</div>
          <div className="stat-label">待处理工单</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats?.totalEngineers || 0}</div>
          <div className="stat-label">工程师总数</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats?.totalCustomers || 0}</div>
          <div className="stat-label">客户总数</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 24 }}>
        {/* 工单趋势 */}
        <div className="card">
          <div className="card-title">📈 工单趋势</div>
          <table className="table">
            <thead>
              <tr>
                <th>周期</th>
                <th>新增工单</th>
                <th>已完成</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>今日</td>
                <td>{trend?.todayOrders || 0}</td>
                <td>{trend?.completedToday || 0}</td>
              </tr>
              <tr>
                <td>近7天</td>
                <td>{trend?.weekOrders || 0}</td>
                <td>{trend?.completedWeek || 0}</td>
              </tr>
              <tr>
                <td>本月</td>
                <td>{trend?.monthOrders || 0}</td>
                <td>{trend?.completedMonth || 0}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 运营指标 */}
        <div className="card">
          <div className="card-title">⚡ 运营指标</div>
          <div className="stats-grid" style={{ marginTop: 16 }}>
            <div className="stat-card">
              <div className="stat-value">{performance?.completionRate || 0}%</div>
              <div className="stat-label">完成率</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{performance?.avgRepairHours || 0}h</div>
              <div className="stat-label">平均维修时长</div>
            </div>
          </div>
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
              <span className="text-secondary">总完成工单</span>
              <span>{performance?.totalCompleted || 0}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
              <span className="text-secondary">投诉总量</span>
              <span>{complaintRate?.totalComplaints || 0}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
              <span className="text-secondary">投诉率</span>
              <span className={(complaintRate && complaintRate.complaintRate > 5) ? 'text-error' : ''}>
                {complaintRate?.complaintRate || 0}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 工程师收益排行 */}
      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-title">🏆 工程师月度收益排行</div>
        {ranking.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 20, color: '#666' }}>暂无数据</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>排名</th>
                <th>工程师</th>
                <th>本月订单</th>
                <th>本月收益</th>
                <th>评分</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((eng) => (
                <tr key={eng.id}>
                  <td>
                    {eng.rank === 1 ? '🥇' : eng.rank === 2 ? '🥈' : eng.rank === 3 ? '🥉' : `#${eng.rank}`}
                  </td>
                  <td>{eng.name}</td>
                  <td>{eng.monthlyOrders} 单</td>
                  <td style={{ color: '#52c41a', fontWeight: 'bold' }}>¥{Number(eng.monthlyRevenue).toFixed(0)}</td>
                  <td>⭐ {Number(eng.rating).toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 提成规则说明 */}
      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-title">📖 提成规则说明</div>
        <div style={{ fontSize: 14, color: '#666', lineHeight: 1.8 }}>
          <p>• <strong>工单总数</strong>：系统中所有历史工单累计数量</p>
          <p>• <strong>待处理工单</strong>：当前等待客服分类的工单数量</p>
          <p>• <strong>完成率</strong>：已完成工单 / 总工单 × 100%</p>
          <p>• <strong>平均维修时长</strong>：从工单创建到完工的平均小时数</p>
          <p>• <strong>提成规则</strong>：1-10单 20%，11-30单 25%，31+单 30%</p>
          <p>• <strong>投诉率</strong>：投诉工单 / 总工单 × 100%，超过 5% 标红预警</p>
        </div>
      </div>
    </div>
  );
}
