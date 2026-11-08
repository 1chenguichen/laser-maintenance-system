import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useLocation, Link } from "react-router-dom";
import { fetchApi, getToken } from "../api";
import "./company-brand.css";
export type Company = {
  id: string;
  name: string;
  logoDataUrl: string | null;
  version: number;
  contactName: string;
  contactPhone: string;
  planName: string;
  employeeLimit: number;
  storageLimitMb: number;
  expiresAt: string | null;
  profile: Record<string, any>;
  updatedAt: string;
};
const Context = createContext<{
  company: Company | null;
  error: string;
  refresh: () => Promise<void>;
  publish: (value: Company) => void;
}>({ company: null, error: "", refresh: async () => {}, publish: () => {} });
function identity(token: string | null) {
  try {
    const p = JSON.parse(atob(token!.split(".")[1]));
    return p.tenantId + ":" + p.sub;
  } catch {
    return "";
  }
}
export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const location = useLocation(),
    token = getToken(),
    key = identity(token),
    live = useRef(key);
  live.current = key;
  const [loaded, setLoaded] = useState<{ key: string; value: Company } | null>(
      null,
    ),
    [error, setError] = useState("");
  const seq = useRef(0);
  const apply = useCallback(
    (value: Company) => {
      if (!key || live.current !== key) return;
      setLoaded({ key, value });
      setError("");
      try {
        const user = JSON.parse(sessionStorage.getItem("cs_admin_user") || "{}");
        if (user.tenantId === value.id)
          sessionStorage.setItem(
            "cs_admin_user",
            JSON.stringify({ ...user, tenantName: value.name }),
          );
      } catch {}
    },
    [key],
  );
  const refresh = useCallback(async () => {
    if (!key) return;
    const n = ++seq.current;
    try {
      const value = await fetchApi<Company>("/admin/company");
      if (seq.current === n && live.current === key) apply(value);
    } catch (e: any) {
      if (seq.current === n && live.current === key)
        setError(e.message || "企业资料加载失败");
    }
  }, [key, apply]);
  const publish = useCallback(
    (value: Company) => {
      seq.current++;
      apply(value);
      try {
        localStorage.setItem(
          "laser_company_changed",
          JSON.stringify({
            tenantId: value.id,
            version: value.version,
            time: Date.now(),
          }),
        );
      } catch {}
    },
    [apply],
  );
  useEffect(() => {
    setError("");
    refresh();
    const visible = () => {
      if (!document.hidden) refresh();
    };
    const storage = (e: StorageEvent) => {
      if (e.key === "laser_company_changed")
        try {
          if (JSON.parse(e.newValue || "{}").tenantId === key.split(":")[0])
            refresh();
        } catch {}
    };
    window.addEventListener("storage", storage);
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    const timer = setInterval(visible, 60000);
    return () => {
      seq.current++;
      clearInterval(timer);
      window.removeEventListener("storage", storage);
      window.removeEventListener("focus", visible);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh, key]);
  const company = loaded?.key === key ? loaded.value : null;
  useEffect(() => {
    const original = document.title;
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]'),
      oldIcon = icon?.getAttribute("href");
    let created: HTMLLinkElement | null = null;
    if (company && location.pathname !== "/login") {
      document.title =
        (company.profile.shortName || company.name) + " · 企业管理后台";
      if (company.logoDataUrl) {
        const target = icon || document.createElement("link");
        if (!icon) {
          target.rel = "icon";
          document.head.appendChild(target);
          created = target;
        }
        target.href = company.logoDataUrl;
      }
    }
    return () => {
      document.title = original;
      if (created) created.remove();
      else if (icon) {
        if (oldIcon === null) icon.removeAttribute("href");
        else if (oldIcon !== undefined) icon.setAttribute("href", oldIcon);
      }
    };
  }, [company, location.pathname]);
  return (
    <Context.Provider value={{ company, error, refresh, publish }}>
      {children}
    </Context.Provider>
  );
}
export const useCompany = () => useContext(Context);
export function CompanyLogo({
  company,
  size = "normal",
}: {
  company: Company | null;
  size?: "normal" | "large" | "small";
}) {
  return (
    <span className={"company-logo company-logo-" + size}>
      {company?.logoDataUrl ? (
        <img src={company.logoDataUrl} alt={company.name + " Logo"} />
      ) : (
        <span aria-hidden="true">
          {(company?.profile.shortName || company?.name || "企").slice(0, 1)}
        </span>
      )}
    </span>
  );
}
export function CompanyBrand({ compact = false }: { compact?: boolean }) {
  const { company } = useCompany();
  return (
    <Link
      to="/company"
      className={"company-brand " + (compact ? "compact" : "")}
      title={company?.name || "企业资料"}
    >
      <CompanyLogo company={company} size={compact ? "small" : "normal"} />
      <span>
        <strong>
          {company?.profile.shortName || company?.name || "企业工作台"}
        </strong>
        <small>{compact ? "企业资料" : "设备服务管理"}</small>
      </span>
    </Link>
  );
}
export function CompanyOverview() {
  const { company, error, refresh } = useCompany();
  if (!company)
    return error ? (
      <div className="company-overview company-overview-error">
        企业资料暂时无法加载<button onClick={() => refresh()}>重试</button>
      </div>
    ) : null;
  return (
    <section className="company-overview" aria-label="当前企业概览">
      <CompanyLogo company={company} size="large" />
      <div className="company-overview-main">
        <span className="company-eyebrow">企业工作台</span>
        <h2>{company.name}</h2>
        <p>
          {company.profile.description || "管理设备服务、客户协作与维修业务。"}
        </p>
        <div className="company-meta">
          {company.profile.industry && <span>{company.profile.industry}</span>}
          {company.profile.serviceArea && (
            <span>服务区域：{company.profile.serviceArea}</span>
          )}
          {company.contactPhone && (
            <span>联系电话：{company.contactPhone}</span>
          )}
        </div>
      </div>
      <div className="company-overview-aside">
        <span className="company-plan">{company.planName}</span>
        <Link to="/company">查看企业资料 →</Link>
      </div>
    </section>
  );
}
