import React, { useEffect, useRef } from "react";
import { API_BASE, getToken } from "../api";
let ready: Promise<void> | undefined;
function load() {
  if (!ready)
    ready = new Promise<void>((resolve, reject) => {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = "/visual-gallery.css";
      document.head.append(css);
      const script = document.createElement("script");
      script.src = "/visual-gallery.js";
      script.onload = () => resolve();
      script.onerror = () => {
        ready = undefined;
        reject(Error("图片组件加载失败"));
      };
      document.head.append(script);
    });
  return ready;
}
export default function VisualGallery({
  kind,
  id,
  title,
}: {
  kind: string;
  id: string;
  title: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true;
    load()
      .then(() => {
        if (active && ref.current)
          (window as any).VisualGallery.mount(ref.current, {
            kind,
            id,
            title,
            apiBase: API_BASE,
            token: getToken,
          });
      })
      .catch((e) => {
        if (ref.current) ref.current.textContent = e.message;
      });
    return () => {
      active = false;
    };
  }, [kind, id, title]);
  return <div ref={ref} style={{ marginTop: 20 }} />;
}
