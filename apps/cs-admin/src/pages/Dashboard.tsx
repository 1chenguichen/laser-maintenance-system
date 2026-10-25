import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import * as echarts from 'echarts';
import { getStats, getWorkOrders, getEngineers, getTrendStats, getPerformanceStats, getEngineerRanking, getComplaintRate, TrendStats, PerformanceStats, EngineerRanking, ComplaintRate, Stats as StatsType, WorkOrderListItem, Engineer } from '../api';
import { WorkOrderStatus } from '../types';

export default function Dashboard() {
  const [stats, setStats] = useState<StatsType | null>(null);
  const [trend, setTrend] = useState<TrendStats | null>(null);
  const [performance, setPerformance] = useState<PerformanceStats | null>(null);
  const [ranking, setRanking] = useState<EngineerRanking[]>([]);
  const [complaintRate, setComplaintRate] = useState<ComplaintRate | null>(null);
  const [pendingOrders, setPendingOrders] = useState<WorkOrderListItem[]>([]);
  const [engineers, setEngineers] = useState<Engineer[]>([]);
  const [loading, setLoading] = useState(true);

  // Chart refs
  const trendChartRef = useRef<HTMLDivElement>(null);
  const statusChartRef = useRef<HTMLDivElement>(null);
  const revenueChartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!loading && trendChartRef.current) {
      renderTrendChart();
    }
    if (!loading && statusChartRef.current) {
      renderStatusChart();
    }
    if (!loading && revenueChartRef.current) {
      renderRevenueChart();
    }
  }, [loading, trend, ranking]);

  async function loadData() {
    try {
      const [statsData, ordersData, engineersData, trendData, perfData, rankingData, complaintData] = await Promise.all([
        getStats(),
        getWorkOrders(),
        getEngineers(),
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

      const pending = (ordersData || []).filter(o => o.status === WorkOrderStatus.PENDING).slice(0, 5);
      setPendingOrders(pending);
      setEngineers(engineersData || []);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }

  function renderTrendChart() {
    if (!trendChartRef.current) return;
    const chart = echarts.init(trendChartRef.current);
    const option = {
      title: { text: '工单趋势', textStyle: { fontSize: 14, fontWeight: 'normal' } },
      tooltip: { trigger: 'axis' },
      legend: { data: ['新增工单', '已完成'], bottom: 0 },
      xAxis: {
        type: 'category',
        data: ['今日', '近7天', '本月']
      },
      yAxis: { type: 'value' },
      series: [
        {
          name: '新增工单',
          type: 'bar',
          data: [trend?.todayOrders || 0, trend?.weekOrders || 0, trend?.monthOrders || 0],
          itemStyle: { color: '#1677ff' }
        },
        {
          name: '已完成',
          type: 'bar',
          data: [trend?.completedToday || 0, trend?.completedWeek || 0, trend?.completedMonth || 0],
          itemStyle: { color: '#52c41a' }
        }
      ]
    };
    chart.setOption(option);
  }

  function renderStatusChart() {
    if (!statusChartRef.current) return;
    const chart = echarts.init(statusChartRef.current);
    const total = stats?.totalOrders || 1;
    const completed = stats?.completedOrders || 0;
    const pending = stats?.pendingOrders || 0;
    const other = total - completed - pending;

    const option = {
      title: { text: '工单状态分布', textStyle: { fontSize: 14, fontWeight: 'normal' } },
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: { bottom: 0 },
      series: [{
        type: 'pie',
        radius: ['40%', '70%'],
        avoidLabelOverlap: false,
        label: { show: false },
        data: [
          { value: completed, name: '已完成', itemStyle: { color: '#52c41a' } },
          { value: pending, name: '待处理', itemStyle: { color: '#ff4d4f' } },
          { value: other > 0 ? other : 0, name: '进行中', itemStyle: { color: '#1677ff' } }
        ]
      }]
    };
    chart.setOption(option);
  }

  function renderRevenueChart() {
    if (!revenueChartRef.current) return;
    const chart = echarts.init(revenueChartRef.current);
    const top5 = (ranking || []).slice(0, 5);

    const option = {
      title: { text: '工程师收益排行 TOP5', textStyle: { fontSize: 14, fontWeight: 'normal' } },
      tooltip: { trigger: 'axis' },
      xAxis: {
        type: 'category',
        data: top5.map(e => e.name),
        axisLabel: { rotate: 0 }
      },
      yAxis: { type: 'value', name: '收益(元)' },
      series: [{
        type: 'bar',
        data: top5.map(e => Number(e.monthlyRevenue)),
        itemStyle: {
          color: function(params: any) {
            const colors = ['#ff4d4f', '#ff7a45', '#ffa940', '#52c41a', '#1890ff'];
            return colors[params.dataIndex] || '#1677ff';
          }
        },
        label: { show: true, position: 'top', formatter: '¥{c}' }
      }]
    };
    chart.setOption(option);
  }

  if (loading) {
    return <div className="card"><div className="loading">加载中...</div></div>;
  }

  const onlineEngineers = (engineers || []).filter(e => e.status === 'ONLINE');
  const workingEngineers = (engineers || []).filter(e => e.status === 'WORKING');

  return (
    <div>
      {/* 核心指标卡片 */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{stats?.pendingOrders || 0}</div>
          <div className="stat-label">待处理工单</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats?.completedOrders || 0}</div>
          <div className="stat-label">已完成工单</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{onlineEngineers.length}</div>
          <div className="stat-label">在线工程师</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats?.totalCustomers || 0}</div>
          <div className="stat-label">客户总数</div>
        </div>
      </div>

      {/* 图表区域 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 24 }}>
        <div className="card">
          <div ref={trendChartRef} style={{ width: '100%', height: 280 }}></div>
        </div>
        <div className="card">
          <div ref={statusChartRef} style={{ width: '100%', height: 280 }}></div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 24 }}>
        <div className="card">
          <div ref={revenueChartRef} style={{ width: '100%', height: 280 }}></div>
        </div>

        {/* 运营指标 */}
        <div className="card">
          <div className="card-title">⚡ 运营指标</div>
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
              <span className="text-secondary">工单完成率</span>
              <span style={{ fontWeight: 600, color: '#52c41a' }}>{performance?.completionRate || 0}%</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
              <span className="text-secondary">平均维修时长</span>
              <span style={{ fontWeight: 600 }}>{performance?.avgRepairHours || 0}h</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
              <span className="text-secondary">总完成工单</span>
              <span>{performance?.totalCompleted || 0}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
              <span className="text-secondary">投诉总量</span>
              <span>{complaintRate?.totalComplaints || 0}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0' }}>
              <span className="text-secondary">投诉率</span>
              <span style={{ fontWeight: 600, color: (complaintRate && complaintRate.complaintRate > 5) ? '#ff4d4f' : '#52c41a' }}>
                {complaintRate?.complaintRate || 0}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 待处理工单和工程师 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 24 }}>
        {/* 待处理工单 */}
        <div className="card">
          <div className="card-title">📋 待处理工单</div>
          {pendingOrders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 20, color: '#666' }}>暂无待处理工单</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>工单号</th>
                  <th>设备</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {pendingOrders.map((order) => (
                  <tr key={order.id}>
                    <td>{order.orderNo}</td>
                    <td>{order.device?.model || '-'}</td>
                    <td>
                      <Link to={`/orders/${order.id}`} className="btn btn-primary btn-small">
                        {order.emergencyLevel >= 3 ? '⚠️ 处理' : '处理'}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Link to="/orders" className="btn btn-default btn-small" style={{ marginTop: 12 }}>
            查看全部 →
          </Link>
        </div>

        {/* 在线工程师 */}
        <div className="card">
          <div className="card-title">👷 工程师状态</div>
          {engineers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 20, color: '#666' }}>暂无工程师</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>工程师</th>
                  <th>状态</th>
                  <th>本月订单</th>
                </tr>
              </thead>
              <tbody>
                {engineers.slice(0, 5).map((eng) => (
                  <tr key={eng.id}>
                    <td>{eng.name}</td>
                    <td>
                      <span className={`badge badge-${eng.status?.toLowerCase() || 'offline'}`}>
                        {eng.status === 'ONLINE' ? '🟢 在线' : eng.status === 'WORKING' ? '🟡 工作中' : '⚪ 离线'}
                      </span>
                    </td>
                    <td>{eng.monthlyOrders} 单</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Link to="/engineers" className="btn btn-default btn-small" style={{ marginTop: 12 }}>
            管理工程师 →
          </Link>
        </div>
      </div>

      {/* 提成规则说明 */}
      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-title">📖 提成规则</div>
        <div style={{ fontSize: 14, color: '#666', lineHeight: 1.8 }}>
          <p>• <strong>1-10单</strong>：提成比例 20%</p>
          <p>• <strong>11-30单</strong>：提成比例 25%</p>
          <p>• <strong>31+单</strong>：提成比例 30%</p>
          <p>• <strong>投诉率预警</strong>：超过 5% 标红</p>
        </div>
      </div>
    </div>
  );
}
