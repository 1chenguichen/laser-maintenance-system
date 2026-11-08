import React, { useState } from "react";
import { API_BASE, getToken } from "../api";
import { Modal } from "./business-shared";
import "./customer-import.css";
type Preview = {
  summary: {
    newCustomers: number;
    skippedCustomers: number;
    newDevices: number;
    skippedDevices: number;
    skippedExamples: number;
    newAddresses: number;
  };
  issues: { sheet: string; row: number; message: string }[];
  rows: {
    sheet: string;
    row: number;
    label: string;
    identifier: string;
    action: string;
  }[];
  token: string | null;
};
async function upload(
  path: string,
  file: File,
  token?: string,
  mode: "customers" | "devices" = "customers",
) {
  const body = new FormData();
  body.append("file", file);
  if (token) body.append("token", token);
  const response = await fetch(
    API_BASE +
      (mode === "devices"
        ? "/admin/device-import/"
        : "/admin/customer-import/") +
      path,
    {
      method: "POST",
      headers: { Authorization: "Bearer " + getToken() },
      body,
    },
  );
  const data = await response.json();
  if (!response.ok)
    throw Error(
      response.status === 413
        ? "文件超过5MB，请拆分后重试"
        : Array.isArray(data.message)
          ? data.message.join("；")
          : data.message || "导入失败",
    );
  return data;
}
function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function CustomerImport({
  onClose,
  onImported,
  mode = "customers",
}: {
  mode?: "customers" | "devices";
  onClose: () => void;
  onImported: (message: string) => void;
}) {
  const [tenantName] = useState(() => {
    try {
      return (
        JSON.parse(sessionStorage.getItem("cs_admin_user") || "{}").tenantName ||
        "当前企业"
      );
    } catch {
      return "当前企业";
    }
  });
  const [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState<Preview | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [downloadBusy, setDownloadBusy] = useState(false),
    [done, setDone] = useState<any>(null);
  async function download() {
    setDownloadBusy(true);
    setError("");
    try {
      const r = await fetch(
        API_BASE +
          (mode === "devices"
            ? "/admin/device-import/template"
            : "/admin/customer-import/template"),
        {
          headers: { Authorization: "Bearer " + getToken() },
        },
      );
      if (!r.ok) throw Error("模板下载失败，请重新登录后重试");
      saveBlob(
        await r.blob(),
        mode === "devices" ? "设备导入模板.xlsx" : "客户与设备导入模板.xlsx",
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDownloadBusy(false);
    }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !file || done) return;
    setBusy(true);
    setError("");
    try {
      if (!preview) {
        setPreview(await upload("preview", file, undefined, mode));
      } else if (preview.token && !preview.issues.length) {
        const result = await upload("commit", file, preview.token, mode);
        setDone(result);
        onImported(result.message);
      }
    } catch (e: any) {
      setError(e.message);
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }
  function errorsFile() {
    if (!preview) return;
    const cell = (v: any) =>
      '"' +
      String(v)
        .replace(/^[=+@-]/, "'$&")
        .replace(/"/g, '""') +
      '"';
    saveBlob(
      new Blob(
        [
          "\uFEFF" +
            [
              ["工作表", "行号", "错误说明"],
              ...preview.issues.map((i) => [i.sheet, i.row, i.message]),
            ]
              .map((row) => row.map(cell).join(","))
              .join("\r\n"),
        ],
        { type: "text/csv;charset=utf-8" },
      ),
      "导入错误清单.csv",
    );
  }
  return (
    <div className="customer-import">
      <Modal
        title={mode === "devices" ? "批量导入设备" : "批量导入客户与设备"}
        busy={busy}
        onClose={onClose}
        onSubmit={
          done
            ? (e) => {
                e.preventDefault();
                onClose();
              }
            : submit
        }
        submitLabel={done ? "完成" : preview ? "确认导入" : "检查文件"}
        submitDisabled={!done && (!file || Boolean(preview?.issues.length))}
      >
        <p className="import-target">
          导入到：<strong>{tenantName}</strong>
        </p>
        <ol className="import-steps">
          <li className={!preview && !done ? "active" : ""}>1 填写模板</li>
          <li className={preview && !done ? "active" : ""}>2 检查数据</li>
          <li className={done ? "active" : ""}>3 导入完成</li>
        </ol>
        {error && (
          <div className="biz-alert" role="alert">
            {error}
          </div>
        )}
        {!done && (
          <>
            <div className="import-template">
              <div>
                <strong>先下载带示例的 Excel 模板</strong>
                <p>
                  {mode === "devices"
                    ? "在「设备与维保」页照着示例填写，客户手机号须已在本企业登记。"
                    : "在「客户名单」页照着示例填写，也可同时填写设备页。"}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-default"
                disabled={downloadBusy || busy}
                onClick={download}
              >
                {downloadBusy ? "下载中…" : "下载模板（含示例）"}
              </button>
            </div>
            <label className="import-upload">
              <span>选择已填写的 Excel 文件</span>
              <input
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setPreview(null);
                  setError("");
                  if (
                    f &&
                    (!f.name.toLowerCase().endsWith(".xlsx") ||
                      f.size > 5 * 1024 * 1024)
                  ) {
                    setFile(null);
                    setError(
                      "仅支持不超过5MB的 .xlsx 文件；旧 .xls 请另存为 .xlsx",
                    );
                    e.target.value = "";
                    return;
                  }
                  setFile(f);
                }}
              />
              {file && <small>{file.name}</small>}
            </label>
            <p className="import-hint">
              {mode === "devices"
                ? "单次最多1000台设备。通过客户手机号或已登记的客户编号关联已有客户，资料一致的重复设备会跳过。"
                : "单次最多500位客户、1000台设备。手机号相同且姓名一致时跳过已有客户，不覆盖原资料；新设备、地址仍会导入。"}
            </p>
          </>
        )}
        {!done && (
          <p className="import-inline-example-hint">
            第1行是表头，第2行是黄色示例（自动跳过），从第3行开始填写自己的资料。行类型填“数据”或留空，不要覆盖示例行。
          </p>
        )}
        {(preview || done) && (
          <p className="import-hint" role="status">
            已自动跳过 {(done || preview).summary.skippedExamples || 0}{" "}
            条示例，示例不会写入数据库。
          </p>
        )}
        {(preview || done) && (
          <section aria-label="导入统计" className="import-summary">
            {[
              ["新增客户", (done || preview).summary.newCustomers],
              ["新增设备", (done || preview).summary.newDevices],
              ["新增地址", (done || preview).summary.newAddresses],
              [
                "跳过已有",
                (done || preview).summary.skippedCustomers +
                  (done || preview).summary.skippedDevices,
              ],
            ].map(([label, value]) => (
              <div key={label}>
                <strong>{value}</strong>
                <span>{label}</span>
              </div>
            ))}
          </section>
        )}
        {preview &&
          !done &&
          (preview.issues.length ? (
            <>
              <div className="import-result-heading">
                <strong role="status">
                  发现 {preview.issues.length} 项错误，尚未写入任何数据
                </strong>
                <button type="button" className="biz-link" onClick={errorsFile}>
                  下载错误清单
                </button>
              </div>
              <div className="import-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>工作表</th>
                      <th>行号</th>
                      <th>问题</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.issues.map((i, index) => (
                      <tr key={index}>
                        <td>{i.sheet}</td>
                        <td>{i.row}</td>
                        <td>{i.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="import-hint">
                在原表中修改后，重新选择文件并检查。
              </p>
            </>
          ) : (
            <>
              <p role="status" className="import-success">
                检查通过。请核对预览后确认导入到当前登录企业。
              </p>
              <div className="import-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>行号</th>
                      <th>姓名 / 型号</th>
                      <th>手机号 / 序列号</th>
                      <th>处理方式</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.slice(0, 50).map((r, index) => (
                      <tr key={index}>
                        <td>
                          {r.sheet} · {r.row}
                        </td>
                        <td>{r.label}</td>
                        <td>{r.identifier}</td>
                        <td>{r.action}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.rows.length > 50 && (
                <p className="import-hint">
                  展示前50行，本次共{preview.rows.length}行。
                </p>
              )}
            </>
          ))}
        {done && (
          <div
            role="status"
            className={done.identitySynced ? "import-success" : "biz-alert"}
          >
            <strong>{done.message}</strong>
            <p>
              {mode === "devices"
                ? "设备列表已更新，已关联客户可在客户端查看对应设备。"
                : "客户列表已更新，可进入详情查看设备、地址和补充资料。"}
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
