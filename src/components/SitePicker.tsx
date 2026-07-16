"use client";

import { useState } from "react";
import type { Site } from "@/lib/types";

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500";

/**
 * 設備フォーム用の 工場/職場 連動セレクト（name=siteId / areaId）。
 * 工場を変えると職場は未設定にリセットされる。EquipmentForm の Grid 内に2フィールドぶん描画する。
 */
export default function SitePicker({
  sites,
  defaultSiteId,
  defaultAreaId,
}: {
  sites: Site[]; // listSitesWithAreas の結果（areas 込み）
  defaultSiteId?: string | null;
  defaultAreaId?: string | null;
}) {
  const [siteId, setSiteId] = useState(defaultSiteId ?? "");
  const [areaId, setAreaId] = useState(defaultAreaId ?? "");
  const areas = sites.find((s) => s.id === siteId)?.areas ?? [];

  return (
    <>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600">工場</label>
        <select
          name="siteId"
          value={siteId}
          onChange={(e) => {
            setSiteId(e.target.value);
            setAreaId("");
          }}
          className={inputCls}
        >
          <option value="">未設定</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600">職場</label>
        <select
          name="areaId"
          value={areaId}
          onChange={(e) => setAreaId(e.target.value)}
          disabled={!siteId}
          className={`${inputCls} disabled:bg-slate-50 disabled:text-slate-400`}
        >
          <option value="">未設定</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
