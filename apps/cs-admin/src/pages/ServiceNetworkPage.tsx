import React, { useEffect, useState } from "react";
import { fetchApi } from "../api";
import PageHeading from "../components/PageHeading";
import { Modal } from "./business-shared";
const states: Record<string, string> = {
  REQUESTED: "待安排",
  ASSIGNED: "待工程师确认",
  ACCEPTED: "已接单",
  QUOTED: "待确认报价",
  APPROVED: "报价已确认",
  IN_SERVICE: "服务中",
  AWAITING_ACCEPTANCE: "待客户验收",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
};
const kinds: Record<string, string> = {
  MERCHANT: "设备服务企业",
  PLATFORM_SERVICE: "平台自营服务企业",
  OUTSOURCE: "外包售后企业",
};
const modes: Record<string, string> = {
  SELF: "自有售后团队",
  PLATFORM: "平台托管调度",
  OUTSOURCE: "合作企业承接",
};
const agreementStates: Record<string, string> = {
  PENDING: "待承接企业确认",
  ACTIVE: "合作中",
  REJECTED: "已拒绝",
  ENDED: "已终止",
};
export default function ServiceNetworkPage() {
  const [network, setNetwork] = useState<any>(null),
    [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [detail, setDetail] = useState<any>(null);
  async function load() {
    try {
      const [n, d] = await Promise.all([
        fetchApi<any>("/market/service-network"),
        fetchApi<any>("/market/company"),
      ]);
      setNetwork(n);
      setData(d);
      setError("");
    } catch (e: any) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function run(fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      await load();
      setNotice("操作已保存");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const own = network?.profiles.find((p: any) => p.id === network.tenantId);
  const partners =
    network?.profiles.filter(
      (p: any) => p.id !== network.tenantId && p.kind !== "MERCHANT",
    ) || [];
  const active =
    network?.agreements.filter(
      (a: any) => a.client_id === network.tenantId && a.state === "ACTIVE",
    ) || [];
  const action = (r: any, action: string, extra: any = {}) =>
    run(() =>
      fetchApi("/market/requests/" + r.id + "/action", {
        method: "POST",
        body: JSON.stringify({
          action,
          version: r.version,
          note: "企业调度员处理服务委托",
          ...extra,
        }),
      }),
    );
  return (
    <div className="biz-page">
      <PageHeading
        title="售后组织与服务协作"
        description="设置售后承接方式，确认平台委托，并安排本企业工程师。"
      />
      {error && (
        <div role="alert" className="biz-alert">
          {error}
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      {!network || !data ? (
        <p>
          正在读取服务网络… <button onClick={load}>重试</button>
        </p>
      ) : (
        <>
          <section className="card">
            <h2 className="card-title">
              本企业售后安排 · {kinds[own?.kind] || "设备服务企业"}
            </h2>
            <p>
              新建平台服务单按此策略安排。已有企业合同工单仍按原合同受理与结算，不会自动迁移。
            </p>
            <form
              className="network-controls"
              key={JSON.stringify(own)}
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                run(() =>
                  fetchApi("/market/service-network", {
                    method: "POST",
                    body: JSON.stringify({
                      type: "profile",
                      serviceMode: f.get("serviceMode"),
                      contractorId: f.get("contractorId"),
                    }),
                  }),
                );
              }}
            >
              <label>
                售后模式
                <select
                  name="serviceMode"
                  defaultValue={own?.service_mode || "PLATFORM"}
                >
                  {Object.entries(modes).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                合作承接企业
                <select
                  name="contractorId"
                  defaultValue={own?.contractor_id || ""}
                >
                  <option value="">自营或平台托管无需选择</option>
                  {active.map((a: any) => (
                    <option key={a.id} value={a.provider_id}>
                      {a.provider_name}
                    </option>
                  ))}
                </select>
              </label>
              <button className="btn btn-primary" disabled={busy}>
                保存售后策略
              </button>
            </form>
          </section>
          <section className="card">
            <h2 className="card-title">企业外包合作</h2>
            <p>
              合作需由对方企业确认。服务区域、设备类别决定新报修能否委托；业务协作登记不代替线下合同签署。
            </p>
            <form
              className="network-controls"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                run(() =>
                  fetchApi("/market/service-network", {
                    method: "POST",
                    body: JSON.stringify({
                      type: "agreement",
                      providerId: f.get("providerId"),
                      cities: String(f.get("cities"))
                        .split(/[,，]/)
                        .map((v) => v.trim())
                        .filter(Boolean),
                    }),
                  }),
                );
              }}
            >
              <label>
                邀请服务企业
                <select name="providerId" required>
                  <option value="">请选择</option>
                  {partners.map((p: any) => (
                    <option value={p.id} key={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                服务城市
                <input
                  name="cities"
                  required
                  defaultValue="全国"
                  placeholder="深圳市，东莞市"
                />
              </label>
              <button className="btn btn-default" disabled={busy}>
                发起合作邀请
              </button>
            </form>
            <div className="flow-table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>委托方</th>
                    <th>承接方</th>
                    <th>区域 / 类别</th>
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {network.agreements.map((a: any) => (
                    <tr key={a.id}>
                      <td>{a.client_name}</td>
                      <td>{a.provider_name}</td>
                      <td>
                        {a.cities.join(" / ")} · {a.categories.length} 类
                      </td>
                      <td>{agreementStates[a.state]}</td>
                      <td>
                        {a.provider_id === network.tenantId &&
                          a.state === "PENDING" && (
                            <>
                              <button
                                disabled={busy}
                                className="btn btn-primary btn-small"
                                onClick={() =>
                                  run(() =>
                                    fetchApi("/market/service-network", {
                                      method: "POST",
                                      body: JSON.stringify({
                                        type: "agreement-state",
                                        id: a.id,
                                        state: "ACTIVE",
                                      }),
                                    }),
                                  )
                                }
                              >
                                确认合作
                              </button>
                              <button
                                disabled={busy}
                                className="btn btn-default btn-small"
                                onClick={() =>
                                  run(() =>
                                    fetchApi("/market/service-network", {
                                      method: "POST",
                                      body: JSON.stringify({
                                        type: "agreement-state",
                                        id: a.id,
                                        state: "REJECTED",
                                      }),
                                    }),
                                  )
                                }
                              >
                                拒绝
                              </button>
                            </>
                          )}
                        {a.state === "ACTIVE" && (
                          <button
                            disabled={busy}
                            className="btn btn-link"
                            onClick={() => {
                              if (
                                window.confirm(
                                  "终止后不再按该合作接收新任务，已派出的任务继续履约。",
                                )
                              )
                                run(() =>
                                  fetchApi("/market/service-network", {
                                    method: "POST",
                                    body: JSON.stringify({
                                      type: "agreement-state",
                                      id: a.id,
                                      state: "ENDED",
                                    }),
                                  }),
                                );
                            }}
                          >
                            终止合作
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="card"><h2 className="card-title">本企业服务项目 · {data.offers.length}</h2>{data.offers.length?data.offers.map((offer:any)=><p key={offer.id}><strong>{offer.title}</strong><small style={{display:'block'}}>{offer.city} · {offer.published?'已上架':'已下架'}</small></p>):<p>暂无已发布服务项目，可由维保云审核发布。</p>}</section>
          <section className="card">
            <h2 className="card-title">
              服务委托与任务调度 · {data.requests.length}
            </h2>
            <div className="flow-table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>单号 / 设备</th>
                    <th>设备关联企业</th>
                    <th>本次承接方</th>
                    <th>委托 / 履约状态</th>
                    <th>工程师</th>
                    <th>处理</th>
                  </tr>
                </thead>
                <tbody>
                  {data.requests.map((r: any) => (
                    <tr key={r.id}>
                      <td>
                        {r.number}
                        <small style={{ display: "block" }}>
                          {r.device_model} · {r.city}
                        </small>
                      </td>
                      <td>{r.commissioner_name || "平台客户"}</td>
                      <td>
                        {r.assigned_provider_name ||
                          r.provider_name ||
                          "平台安排中"}
                      </td>
                      <td>
                        {
                          (
                            {
                              NONE: "未委托",
                              PENDING: "待企业接单",
                              ACCEPTED: "企业已承接",
                              REJECTED: "企业已拒绝",
                            } as any
                          )[r.delegation_state]
                        }
                        <small style={{ display: "block" }}>
                          {states[r.status]}
                        </small>
                      </td>
                      <td>{r.engineer_name || "待安排"}</td>
                      <td>
                        {r.status === "REQUESTED" &&
                          r.assigned_provider_id === network.tenantId &&
                          r.delegation_state === "PENDING" && (
                            <>
                              <button
                                disabled={busy}
                                className="btn btn-primary btn-small"
                                onClick={() => action(r, "delegate-accept")}
                              >
                                接受委托
                              </button>
                              <button
                                disabled={busy}
                                className="btn btn-default btn-small"
                                onClick={() => action(r, "delegate-reject")}
                              >
                                拒绝委托
                              </button>
                            </>
                          )}
                        {r.status === "REQUESTED" &&
                          r.assigned_provider_id === network.tenantId &&
                          r.delegation_state === "ACCEPTED" && (
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                action(r, "assign", {
                                  engineerId: new FormData(e.currentTarget).get(
                                    "engineerId",
                                  ),
                                });
                              }}
                            >
                              <select
                                name="engineerId"
                                aria-label="选择本企业工程师"
                                required
                              >
                                <option value="">选择本企业工程师</option>
                                {network.engineers
                                  .filter((p: any) => p.state === "APPROVED")
                                  .map((p: any) => (
                                    <option
                                      value={p.person_id}
                                      key={p.person_id}
                                    >
                                      {p.name} · {p.phone}
                                    </option>
                                  ))}
                              </select>
                              <button
                                disabled={busy}
                                className="btn btn-primary btn-small"
                              >
                                指派工程师
                              </button>
                            </form>
                          )}
                        {r.status === "REQUESTED" &&
                          r.commissioner_id === network.tenantId &&
                          r.delegation_state === "NONE" &&
                          active.length > 0 && (
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                action(r, "delegate", {
                                  providerId: new FormData(e.currentTarget).get(
                                    "providerId",
                                  ),
                                });
                              }}
                            >
                              <select
                                name="providerId"
                                aria-label="选择外包企业"
                              >
                                {active.map((a: any) => (
                                  <option value={a.provider_id} key={a.id}>
                                    {a.provider_name}
                                  </option>
                                ))}
                              </select>
                              <button
                                disabled={busy}
                                className="btn btn-default btn-small"
                              >
                                委托合作企业
                              </button>
                            </form>
                          )}
                        {r.status === "REQUESTED" &&
                          r.commissioner_id === network.tenantId &&
                          ["PENDING", "ACCEPTED", "REJECTED"].includes(
                            r.delegation_state,
                          ) && (
                            <button
                              disabled={busy}
                              className="btn btn-link btn-small"
                              onClick={() => action(r, "delegate-withdraw")}
                            >
                              撤回安排
                            </button>
                          )}
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
            {!data.requests.length && <p>暂无关联服务单。</p>}
          </section>
        </>
      )}
      {detail && (
        <Modal
          title="服务单详情"
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
            履约企业：
            {detail.assigned_provider_name ||
              detail.provider_name ||
              "平台安排中"}
          </p>
          <p>
            客户：{detail.customer.name} / {detail.customer.phone}
          </p>
          <p>
            设备：{detail.device_model} · SN: {detail.device_serial || "未登记"}
          </p>
          <p>
            地址：{detail.city} {detail.address}
          </p>
          <p>需求：{detail.description}</p>
          <p>
            报价：
            {detail.quote_amount === null
              ? "待报价"
              : "¥" + detail.quote_amount}
          </p>
          <p>服务记录：{detail.report || "尚未提交"}</p>
          <h3>委托与履约动态</h3>
          {detail.events.map((e: any, i: number) => (
            <p key={i}>
              {e.created_at} · {e.action} · {e.note}
            </p>
          ))}
        </Modal>
      )}
      <style>{`.network-controls{display:flex;flex-wrap:wrap;align-items:flex-end;gap:14px;margin:16px 0 24px}.network-controls label{display:grid;gap:6px;font-size:13px}.network-controls input,.network-controls select{min-height:40px;max-width:330px;border:1px solid var(--ui-border,#dce5df);border-radius:8px;padding:8px 10px;background:var(--admin-surface,#fff);color:inherit}.flow-table-scroll form{display:grid;gap:8px;min-width:180px}.flow-table-scroll select{max-width:240px;min-height:36px}`}</style>
    </div>
  );
}
