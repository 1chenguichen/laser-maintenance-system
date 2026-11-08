import React, { useEffect, useState } from "react";
import { fetchApi } from "../api";
import PageHeading from "../components/PageHeading";
import { Modal } from "./business-shared";
const states: Record<string, string> = {
  REQUESTED: "待安排",
  ASSIGNED: "已派单",
  ACCEPTED: "已接单",
  QUOTED: "待确认报价",
  APPROVED: "已确认报价",
  IN_SERVICE: "服务中",
  AWAITING_ACCEPTANCE: "待验收",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
};
export default function ServiceNetwork() {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [detail, setDetail] = useState<any>(null);
  async function load() {
    try {
      setData(await fetchApi("/market/company"));
      setError("");
    } catch (e: any) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, []);
  return (
    <div className="biz-page">
      <PageHeading
        title="平台服务协作"
        description="查看本企业关联的平台服务单。原有企业工单仍在工单管理中独立处理。"
      />
      <p className="biz-notice">
        客户直接提交的市场需求先由客户确认报价。关联企业不代表自动承担费用，保障内报修继续按原服务协议处理。
      </p>
      {error && (
        <div className="biz-alert" role="alert">
          {error}
        </div>
      )}
      <button className="btn btn-default" onClick={load}>
        刷新协作记录
      </button>
      {data && (
        <>
          <section className="card" style={{ marginTop: 20 }}>
            <h2 className="card-title">
              本企业服务项目 · {data.offers.length}
            </h2>
            {data.offers.length ? (
              data.offers.map((o: any) => (
                <p key={o.id}>
                  {o.title} · {o.city} · {o.published ? "已上架" : "已下架"}
                </p>
              ))
            ) : (
              <p>暂无服务项目，可联系平台运营人员审核发布。</p>
            )}
          </section>
          <section className="card">
            <h2 className="card-title">
              关联平台服务单 · {data.requests.length}
            </h2>
            <div className="flow-table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    {[
                      "服务单",
                      "设备 / 城市",
                      "原关联企业",
                      "实际承接方",
                      "工程师",
                      "状态",
                      "操作",
                    ].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.requests.map((r: any) => (
                    <tr key={r.id}>
                      <td>
                        {r.number}
                        <small style={{ display: "block" }}>
                          {r.service_title}
                        </small>
                      </td>
                      <td>
                        {r.device_model} / {r.city}
                        {r.device_serial && (
                          <small style={{ display: "block" }}>
                            SN: {r.device_serial}
                          </small>
                        )}
                      </td>
                      <td>{r.commissioner_name || "客户直接委托"}</td>
                      <td>
                        {r.assigned_provider_name ||
                          r.provider_name ||
                          "平台安排中"}
                      </td>
                      <td>{r.engineer_name || "待安排"}</td>
                      <td>{states[r.status]}</td>
                      <td>
                        <button
                          className="btn btn-link btn-small"
                          onClick={async () => {
                            try {
                              setDetail(
                                await fetchApi("/market/requests/" + r.id),
                              );
                            } catch (e: any) {
                              setError(e.message);
                            }
                          }}
                        >
                          详情
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
      {detail && (
        <Modal
          title="平台服务单详情"
          busy={false}
          onClose={() => setDetail(null)}
          onSubmit={(e) => {
            e.preventDefault();
            setDetail(null);
          }}
          submitLabel="关闭"
        >
          <p>
            {detail.number} · {states[detail.status]}
          </p>
          <p>
            客户：{detail.customer.name} / {detail.customer.phone}
          </p>
          <p>
            设备：{detail.device_model} · SN: {detail.device_serial || "未登记"}
          </p>
          <p>
            上门地址：{detail.city} {detail.address}
          </p>
          <p>需求：{detail.description}</p>
          <p>
            报价：
            {detail.quote_amount === null
              ? "待报价"
              : "¥" + detail.quote_amount}
          </p>
          <p>服务记录：{detail.report || "尚未提交"}</p>
        </Modal>
      )}
    </div>
  );
}
