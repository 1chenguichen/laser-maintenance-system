import React, { useEffect, useState, useRef } from "react";
import VisualGallery from "../components/VisualGallery";
import { API_BASE, fetchApi, getToken } from "../api";
import { Company, useCompany, CompanyLogo } from "../components/CompanyBrand";
import { useWorkspaceFeedback } from "../components/WorkspaceFeedback";
import PageHeading from "../components/PageHeading";
const keys = [
  "name",
  "shortName",
  "englishName",
  "industry",
  "description",
  "address",
  "serviceArea",
  "serviceHours",
  "website",
  "email",
  "contactName",
  "contactPhone",
] as const;
function formOf(c: Company) {
  return Object.fromEntries(
    keys.map((k) => [
      k,
      k === "name"
        ? c.name
        : k === "contactName"
          ? c.contactName
          : k === "contactPhone"
            ? c.contactPhone
            : c.profile[k] || "",
    ]),
  ) as Record<(typeof keys)[number], string>;
}
export default function CompanySettings() {
  const { company, error, refresh, publish } = useCompany(),
    notify = useWorkspaceFeedback();
  const [form, setForm] = useState<ReturnType<typeof formOf> | null>(null),
    [baseVersion, setBaseVersion] = useState(0),
    [busy, setBusy] = useState(false),
    [problem, setProblem] = useState(""),
    [dirty, setDirty] = useState(false),
    [removeConfirm, setRemoveConfirm] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (company && !dirty) {
      setForm(formOf(company));
      setBaseVersion(company.version);
    }
  }, [company, dirty]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const leave = (event: MouseEvent) => {
      const link = (event.target as Element)?.closest?.(
        "a[href]",
      ) as HTMLAnchorElement | null;
      if (
        !link ||
        link.hasAttribute("download") ||
        link.target === "_blank" ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey
      )
        return;
      const url = new URL(link.href, location.href);
      if (
        url.origin === location.origin &&
        url.pathname !== location.pathname &&
        !window.confirm("企业资料尚未保存，确定离开并放弃修改吗？")
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", leave, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", leave, true);
    };
  }, [dirty]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form || busy) return;
    setBusy(true);
    setProblem("");
    try {
      const next = await fetchApi<Company>("/admin/company", {
        method: "PUT",
        body: JSON.stringify({ ...form, version: baseVersion }),
      });
      setDirty(false);
      setForm(formOf(next));
      setBaseVersion(next.version);
      publish(next);
      notify("企业资料已保存，企业标识已同步更新");
    } catch (e: any) {
      setProblem(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function changeLogo(file?: File, remove = false) {
    if (!company || busy) return;
    setProblem("");
    if (dirty) {
      setProblem("请先保存或放弃资料修改，再调整 Logo");
      if (input.current) input.current.value = "";
      return;
    }
    if (
      file &&
      (file.size > 2 * 1024 * 1024 ||
        !["image/png", "image/jpeg", "image/webp"].includes(file.type))
    ) {
      setProblem("请选择不超过2MB的 PNG、JPG 或 WebP 图片");
      return;
    }
    setBusy(true);
    try {
      let next: Company;
      if (remove)
        next = await fetchApi<Company>(
          "/admin/company/logo?version=" + company.version,
          { method: "DELETE" },
        );
      else {
        if (!file) return;
        const data = new FormData();
        data.append("file", file);
        data.append("version", String(company.version));
        const response = await fetch(API_BASE + "/admin/company/logo", {
          method: "POST",
          headers: { Authorization: "Bearer " + getToken() },
          body: data,
        });
        const result = await response.json();
        if (!response.ok) throw Error(result.message || "Logo上传失败");
        next = result;
      }
      publish(next);
      setRemoveConfirm(false);
      notify(remove ? "企业 Logo 已移除" : "企业 Logo 已更新");
    } catch (e: any) {
      setProblem(e.message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  if (!company || !form)
    return (
      <div className="card">
        {error ? (
          <>
            <p role="alert">{error}</p>
            <button className="btn btn-default" onClick={() => refresh()}>
              重新加载
            </button>
          </>
        ) : (
          "正在加载企业资料…"
        )}
      </div>
    );
  const field = (
    key: (typeof keys)[number],
    label: string,
    options: {
      required?: boolean;
      max?: number;
      type?: string;
      wide?: boolean;
    } = {},
  ) => (
    <label className={"company-field " + (options.wide ? "wide" : "")}>
      <span>
        {label}
        {options.required && <em>必填</em>}
      </span>
      {key === "description" ? (
        <textarea
          aria-label={label}
          maxLength={options.max || 1000}
          value={form[key]}
          disabled={busy}
          onChange={(e) => {
            setForm({ ...form, [key]: e.target.value });
            setDirty(true);
          }}
        />
      ) : (
        <input
          aria-label={label}
          type={options.type || "text"}
          required={options.required}
          minLength={key === "name" ? 2 : undefined}
          maxLength={options.max || 100}
          value={form[key]}
          disabled={busy}
          onChange={(e) => {
            setForm({ ...form, [key]: e.target.value });
            setDirty(true);
          }}
        />
      )}
    </label>
  );
  return (
    <div className="company-settings">
      <PageHeading
        title="企业资料"
        description="管理企业标识和联系信息，保存后同步到当前企业工作台。"
      />
      <section className="company-panel">
        <VisualGallery
          kind="company"
          id={company.id}
          title="服务团队与维修车间图片"
        />
      </section>
      {company.profile.sampleData && (
        <div className="company-example-note">
          当前展示的是演示资料与原创示例 Logo，可在此替换为企业正式信息。
        </div>
      )}
      {problem && (
        <div className="biz-alert" role="alert">
          {problem}
        </div>
      )}
      {dirty && company.version !== baseVersion && (
        <div className="biz-alert" role="alert">
          资料已在其他窗口更新。当前输入已保留，请先记录修改，再点击“重新加载”获取最新资料。
        </div>
      )}
      <div className="company-settings-grid">
        <div>
          <section className="company-panel">
            <div className="company-section-heading">
              <h2>企业品牌标识</h2>
              <span>显示于左上角、首页及浏览器标签</span>
            </div>
            <div className="company-logo-editor">
              <CompanyLogo company={company} size="large" />
              <div>
                <strong>{company.profile.shortName || company.name}</strong>
                <p>推荐方形透明底图片，PNG / JPG / WebP，最大2MB。</p>
                <div className="company-logo-actions">
                  <button
                    type="button"
                    className="btn btn-default"
                    disabled={busy || dirty}
                    onClick={() => input.current?.click()}
                  >
                    {company.logoDataUrl ? "更换 Logo" : "上传 Logo"}
                  </button>
                  {company.logoDataUrl && (
                    <button
                      type="button"
                      className="biz-link"
                      disabled={busy || dirty}
                      onClick={() => setRemoveConfirm(true)}
                    >
                      移除 Logo
                    </button>
                  )}
                </div>
                <input
                  ref={input}
                  type="file"
                  aria-label="上传企业Logo"
                  accept="image/png,image/jpeg,image/webp"
                  hidden
                  onChange={(e) => changeLogo(e.target.files?.[0])}
                />
                {removeConfirm && (
                  <div className="company-remove-confirm" role="alert">
                    移除后将显示企业名称首字。
                    <button
                      type="button"
                      className="biz-link"
                      disabled={busy}
                      onClick={() => changeLogo(undefined, true)}
                    >
                      确认移除
                    </button>
                    <button
                      type="button"
                      className="biz-link"
                      onClick={() => setRemoveConfirm(false)}
                    >
                      取消
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>
          <form onSubmit={save}>
            <section className="company-panel">
              <div className="company-section-heading">
                <h2>基本信息</h2>
                <span>名称用于识别当前企业，不改变账号和业务归属</span>
              </div>
              <div className="company-form-grid">
                {field("name", "企业全称", {
                  required: true,
                  max: 100,
                  wide: true,
                })}
                {field("shortName", "企业简称", { max: 30 })}
                {field("englishName", "英文名称", { max: 100 })}
                {field("industry", "所属行业", { max: 50 })}
                {field("serviceArea", "服务区域", { max: 60 })}
                {field("description", "企业简介", { max: 1000, wide: true })}
              </div>
            </section>
            <section className="company-panel">
              <div className="company-section-heading">
                <h2>联系与服务</h2>
                <span>用于企业内部查询与业务联系</span>
              </div>
              <div className="company-form-grid">
                {field("contactName", "联系人", { max: 50 })}
                {field("contactPhone", "联系电话", { type: "tel", max: 32 })}
                {field("email", "联系邮箱", { type: "email", max: 100 })}
                {field("website", "企业官网", { type: "url", max: 200 })}
                {field("serviceHours", "服务时间", { max: 80 })}
                {field("address", "企业地址", { max: 200, wide: true })}
              </div>
            </section>
            <div className="company-savebar">
              <span role="status">
                {busy ? "正在保存…" : dirty ? "有尚未保存的修改" : "资料已同步"}
              </span>
              <div>
                <button
                  type="button"
                  className="btn btn-default"
                  disabled={busy}
                  onClick={() => {
                    setDirty(false);
                    setForm(formOf(company));
                    setBaseVersion(company.version);
                    setProblem("");
                    refresh();
                  }}
                >
                  重新加载 / 放弃修改
                </button>
                <button className="btn btn-primary" disabled={busy || !dirty}>
                  {busy ? "保存中…" : "保存企业资料"}
                </button>
              </div>
            </div>
          </form>
        </div>
        <aside className="company-settings-aside">
          <section className="company-panel">
            <h2>工作台展示预览</h2>
            <div className="company-brand-preview">
              <CompanyLogo company={company} />
              <div>
                <strong>{form.shortName || form.name}</strong>
                <small>设备服务管理</small>
              </div>
            </div>
            <p className="company-muted">完整企业名称：{form.name}</p>
            <p className="company-muted">
              简称用于导航栏；详细资料集中在本页，保持业务页面简洁。
            </p>
          </section>
          <section className="company-panel">
            <h2>当前服务</h2>
            <dl className="company-subscription">
              <div>
                <dt>服务套餐</dt>
                <dd>{company.planName}</dd>
              </div>
              <div>
                <dt>员工额度</dt>
                <dd>{company.employeeLimit} 人</dd>
              </div>
              <div>
                <dt>附件空间</dt>
                <dd>
                  {(company.storageLimitMb / 1024).toLocaleString("zh-CN")} GB
                </dd>
              </div>
              <div>
                <dt>服务有效期</dt>
                <dd>
                  {company.expiresAt
                    ? new Date(company.expiresAt).toLocaleDateString("zh-CN")
                    : "未设置到期日"}
                </dd>
              </div>
            </dl>
            <p className="company-muted">
              套餐、额度与有效期由平台管理，调整请联系平台管理员。
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
