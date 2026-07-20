import type { ItemType, PhotoMode } from "./types";

/**
 * 点検マスタ標準搭載: 汎用設備向けの手順書テンプレート。
 * DB 依存なしの純データ（クライアントコンポーネントからも import 可能）。
 * しきい値は一般的な保全知識の範囲の目安値 — instruction に「機種に合わせて調整」を明記し、
 * 作成後は既存の項目エディタでそのまま変更できる。
 */

export interface ProcedureTemplateItem {
  label: string;
  itemType: ItemType; // "ok_ng" | "numeric" | "text" | "photo"
  instruction?: string;
  unit?: string; // numeric のみ
  min?: number; // 以上で OK
  max?: number; // 以下で OK
  photoMode?: PhotoMode; // 省略時 "none"。photo タイプはサーバー側で required に正規化
  requireCommentOnNg?: boolean;
}

export interface ProcedureTemplate {
  key: string; // 安定キー（Server Action に渡す唯一の識別子）
  name: string;
  description: string;
  category: string;
  recommendedInterval: string; // 表示用ヒント
  items: ProcedureTemplateItem[];
}

export const PROCEDURE_TEMPLATES: ProcedureTemplate[] = [
  {
    key: "compressor-daily",
    name: "スクリューコンプレッサ 日常点検",
    description: "始業前〜運転開始直後に実施。圧力・温度・ドレンを中心に確認。",
    category: "空圧・ユーティリティ",
    recommendedInterval: "毎日",
    items: [
      { label: "異音・異常振動がないか", itemType: "ok_ng", instruction: "運転音を確認。普段と違う金属音・うなり音があれば NG。", requireCommentOnNg: true },
      { label: "吐出圧力", itemType: "numeric", instruction: "負荷運転中の圧力計を読む。基準は機種の設定圧に合わせて調整。", unit: "MPa", min: 0.6, max: 0.9, photoMode: "optional" },
      { label: "吐出温度", itemType: "numeric", instruction: "本体表示パネルの吐出温度。100℃超は要停止・点検。", unit: "℃", max: 100 },
      { label: "オイルレベル（サイトグラス）", itemType: "ok_ng", instruction: "停止時にゲージ中央付近にあること。" },
      { label: "ドレン排出（タンク・トラップ）", itemType: "ok_ng", instruction: "ドレンバルブを開け水分を排出。自動トラップは作動確認。" },
      { label: "吸込フィルタの目詰まり表示", itemType: "ok_ng", instruction: "差圧インジケータが赤域なら NG（清掃・交換）。" },
      { label: "圧力計の写真", itemType: "photo", instruction: "圧力計全体が写るように撮影。" },
    ],
  },
  {
    key: "pump-monthly",
    name: "ポンプ 月次点検",
    description: "渦巻ポンプ等の月例点検。漏れ・振動・温度から劣化兆候を早期発見。",
    category: "回転機",
    recommendedInterval: "1か月ごと",
    items: [
      { label: "異音・キャビテーション音", itemType: "ok_ng", instruction: "砂利を噛むような音は NG（吸込側の異常）。", requireCommentOnNg: true },
      { label: "吐出圧力", itemType: "numeric", instruction: "定格運転時の圧力計。基準は設備の定格に合わせて調整。", unit: "MPa", min: 0.2, max: 0.5, photoMode: "optional" },
      { label: "軸受温度", itemType: "numeric", instruction: "放射温度計で軸受箱表面を測定。70℃超は給脂・点検。", unit: "℃", max: 70 },
      { label: "振動値", itemType: "numeric", instruction: "振動計で軸受部を測定（ISO 20816 目安。機種に合わせて調整）。", unit: "mm/s", max: 7.1 },
      { label: "メカニカルシール・パッキン漏れ", itemType: "ok_ng", instruction: "メカシールは漏れゼロ、グランドは滴下程度なら可。", photoMode: "optional" },
      { label: "カップリング・基礎ボルトの緩み", itemType: "ok_ng", instruction: "ゴムの摩耗粉・ボルトの合いマークずれを確認。" },
      { label: "電流値", itemType: "numeric", instruction: "クランプメータで測定。銘板の定格電流以下であること。", unit: "A" },
    ],
  },
  {
    key: "fan-monthly",
    name: "送風機・ファン 月次点検",
    description: "送風機・排風機の月例点検。ベルト・軸受・羽根車を中心に確認。",
    category: "回転機",
    recommendedInterval: "1か月ごと",
    items: [
      { label: "異音・異常振動", itemType: "ok_ng", instruction: "軸受のゴロゴロ音、ベルト鳴きがあれば NG。", requireCommentOnNg: true },
      { label: "Vベルトの張り・損傷", itemType: "ok_ng", instruction: "指で押して10mm程度のたわみ。ひび割れ・偏摩耗は交換。", photoMode: "optional" },
      { label: "軸受温度", itemType: "numeric", instruction: "放射温度計で測定。周囲温度+40℃以内が目安。", unit: "℃", max: 70 },
      { label: "軸受の給脂状態", itemType: "ok_ng", instruction: "グリースニップルから適量給脂（入れすぎ注意）。" },
      { label: "羽根車の汚れ・付着物", itemType: "ok_ng", instruction: "粉塵付着はアンバランス振動の原因。清掃する。", photoMode: "optional" },
      { label: "吸込口・フィルタの目詰まり", itemType: "ok_ng", instruction: "風量低下の主因。フィルタは清掃または交換。" },
      { label: "防振ゴム・基礎ボルトの緩み", itemType: "ok_ng", instruction: "亀裂・つぶれ、ナットの合いマークずれを確認。" },
    ],
  },
  {
    key: "boiler-daily",
    name: "ボイラー 日常点検",
    description: "小型貫流ボイラー等の日常点検。水位・圧力・燃焼・インターロックを確認。",
    category: "熱源・ボイラー",
    recommendedInterval: "毎日",
    items: [
      { label: "水面計の水位", itemType: "ok_ng", instruction: "常用水位（ガラス中央付近）にあること。2組の水面計で一致確認。", requireCommentOnNg: true },
      { label: "蒸気圧力", itemType: "numeric", instruction: "常用圧力の範囲内。基準は自社の設定圧に合わせて調整。", unit: "MPa", min: 0.6, max: 0.9, photoMode: "optional" },
      { label: "給水ポンプの作動", itemType: "ok_ng", instruction: "自動給水の起動・停止を確認。異音があれば NG。" },
      { label: "燃焼状態", itemType: "ok_ng", instruction: "失火・異常燃焼（煙・臭気・振動燃焼）がないこと。" },
      { label: "低水位燃焼遮断装置のテスト", itemType: "ok_ng", instruction: "給水停止試験で低水位時にバーナーが停止すること。", requireCommentOnNg: true },
      { label: "ブロー（缶水吹出し）", itemType: "ok_ng", instruction: "缶水の濃縮防止のため実施（自動ブローは作動確認）。" },
      { label: "清缶剤（水処理剤）の残量", itemType: "ok_ng", instruction: "薬注タンクの残量を確認、不足時は補充。" },
      { label: "燃料・蒸気配管の漏れ", itemType: "ok_ng", instruction: "配管接続部・バルブ回りに漏れ・にじみがないこと。" },
    ],
  },
  {
    key: "forklift-daily",
    name: "フォークリフト 始業前点検",
    description: "労働安全衛生規則に基づく作業開始前点検。運転者が実施。",
    category: "運搬・車両",
    recommendedInterval: "毎日",
    items: [
      { label: "ブレーキの効き・踏みしろ", itemType: "ok_ng", instruction: "微速前進で確実に停止すること。", requireCommentOnNg: true },
      { label: "タイヤの空気圧・損傷", itemType: "ok_ng", instruction: "偏摩耗・亀裂・異物刺さりがないこと。" },
      { label: "ハンドルの遊び・操作性", itemType: "ok_ng", instruction: "遊びが大きすぎないこと、ガタつきがないこと。" },
      { label: "作動油の油量・漏れ", itemType: "ok_ng", instruction: "リフトシリンダ・ホース回りの油にじみを確認。" },
      { label: "フォーク・チェーン・マスト", itemType: "ok_ng", instruction: "フォークの曲がり・亀裂、チェーンの張り左右差がないこと。", photoMode: "optional" },
      { label: "灯火類・ホーン・バックブザー", itemType: "ok_ng", instruction: "前照灯・方向指示器・警報類がすべて作動すること。" },
      { label: "バッテリー液量・充電量（燃料残量）", itemType: "ok_ng", instruction: "液面が LOWER 以上、充電残量が作業に足りること。" },
      { label: "アワーメーター読み", itemType: "numeric", instruction: "稼働時間を記録（定期整備の周期管理用）。", unit: "h" },
    ],
  },
  {
    key: "diecast-daily",
    name: "ダイカストマシン 日常点検",
    description: "コールドチャンバーダイカストマシンの始業前〜運転中点検。油圧・金型まわり・安全装置を確認。",
    category: "鋳造・成形",
    recommendedInterval: "毎日",
    items: [
      { label: "非常停止ボタン・安全ドアインターロックの作動", itemType: "ok_ng", instruction: "始業前に必ず確認。ドア開で型締動作が停止すること。作動しない場合は運転禁止。", requireCommentOnNg: true },
      { label: "異音・異常振動（油圧ポンプ・モーター）", itemType: "ok_ng", instruction: "運転音を確認。普段と違ううなり音・打音があれば NG。", requireCommentOnNg: true },
      { label: "作動油量（油面計）", itemType: "ok_ng", instruction: "タンク油面計が規定範囲内にあること。不足時は同一銘柄を補給。" },
      { label: "作動油温度", itemType: "numeric", instruction: "油温計を読む。55℃超は冷却系の点検。基準は機種に合わせて調整。", unit: "℃", max: 55 },
      { label: "油圧（システム圧力）", itemType: "numeric", instruction: "運転中の圧力計を読む。基準は機種の設定圧に合わせて調整。", unit: "MPa", min: 12, max: 16, photoMode: "optional" },
      { label: "油漏れ（配管・シリンダ・バルブ回り）", itemType: "ok_ng", instruction: "接続部・シリンダロッド回りの油にじみ・滴下を確認。", photoMode: "optional" },
      { label: "金型取付ボルト・クランプの緩み", itemType: "ok_ng", instruction: "型交換後は特に注意。合いマークのずれ・脱落がないこと。" },
      { label: "タイバー・プラテン摺動部の給脂状態", itemType: "ok_ng", instruction: "かじり傷・グリース切れがないこと。自動給脂は吐出を確認。" },
      { label: "プランジャチップ・スリーブの状態", itemType: "ok_ng", instruction: "かじり・湯漏れ痕がないこと。潤滑剤の供給を確認。" },
      { label: "冷却水の流量・漏れ", itemType: "ok_ng", instruction: "金型・油クーラーへの通水を流量計/リターン目視で確認。" },
      { label: "離型剤スプレーの噴霧状態", itemType: "ok_ng", instruction: "ノズル詰まり・噴霧パターンの乱れがないこと。" },
      { label: "圧力計・油温計の写真", itemType: "photo", instruction: "計器盤全体が写るように撮影。" },
    ],
  },
  {
    key: "diecast-monthly",
    name: "ダイカストマシン 月次点検",
    description: "ダイカストマシンの月例点検。油圧系の劣化兆候・機構部の摩耗・安全装置の総点検。",
    category: "鋳造・成形",
    recommendedInterval: "1か月ごと",
    items: [
      { label: "安全装置の総点検（光線式・両手操作・ドアロック）", itemType: "ok_ng", instruction: "全安全装置を1つずつ作動試験。1つでも不作動なら運転禁止。", requireCommentOnNg: true },
      { label: "作動油の汚れ・乳化", itemType: "ok_ng", instruction: "サンプル採取し変色・白濁（水分混入）・異臭を確認。", photoMode: "optional", requireCommentOnNg: true },
      { label: "油圧フィルタの目詰まり表示", itemType: "ok_ng", instruction: "差圧インジケータが赤域なら NG（交換）。" },
      { label: "アキュムレータ窒素ガス封入圧", itemType: "numeric", instruction: "油圧を抜いてから測定。基準値は機種の指定封入圧に合わせて調整。", unit: "MPa", min: 8, max: 12 },
      { label: "タイバーの摩耗・給脂", itemType: "ok_ng", instruction: "摺動面の傷・段付き摩耗を確認し給脂。" },
      { label: "トグルリンク・ブッシュのガタ・給脂", itemType: "ok_ng", instruction: "型締時のガタつき・異音を確認。給脂ラインの詰まりに注意。" },
      { label: "射出速度（高速切替の実測値）", itemType: "numeric", instruction: "モニタ表示の実測値を記録。基準は品番の条件表に合わせて調整。", unit: "m/s", photoMode: "optional" },
      { label: "電磁弁・端子箱の緩み・変色", itemType: "ok_ng", instruction: "電源遮断後に増し締め。過熱による変色があれば NG。" },
      { label: "冷却水配管のスケール・詰まり", itemType: "ok_ng", instruction: "流量低下・温調不良があれば配管洗浄。" },
      { label: "給湯装置（ラドル）・押出装置の作動", itemType: "ok_ng", instruction: "動作のひっかかり・位置ずれがないこと。" },
    ],
  },
  {
    key: "dust-collector-monthly",
    name: "集塵機 月次点検",
    description: "バグフィルタ式集塵機の月例点検。差圧とパルス洗浄の健全性を確認。",
    category: "環境・安全",
    recommendedInterval: "1か月ごと",
    items: [
      { label: "フィルタ差圧", itemType: "numeric", instruction: "差圧計を読む。基準は機種により調整（高すぎ=目詰まり、低すぎ=破損疑い）。", unit: "kPa", min: 0.2, max: 1.5, photoMode: "optional" },
      { label: "パルスジェットの作動", itemType: "ok_ng", instruction: "電磁弁の作動音が周期的に鳴っていること。" },
      { label: "圧縮空気圧力（パルス用）", itemType: "numeric", instruction: "レギュレータの設定値を確認。", unit: "MPa", min: 0.4, max: 0.6 },
      { label: "ダスト回収容器の排出", itemType: "ok_ng", instruction: "溜まり量を確認し排出。満杯運転は吸引低下の原因。" },
      { label: "ろ布・カートリッジの破損", itemType: "ok_ng", instruction: "クリーン側に粉が回っていたら破損疑いで NG。", photoMode: "optional", requireCommentOnNg: true },
      { label: "ファンの異音・振動", itemType: "ok_ng", instruction: "羽根車への粉塵付着によるアンバランスに注意。" },
      { label: "ダクト・接続部の漏れ", itemType: "ok_ng", instruction: "フード吸込みの低下、接続部の粉漏れがないこと。" },
    ],
  },
  {
    key: "welder-monthly",
    name: "溶接機 月次点検",
    description: "アーク溶接機（半自動含む）の月例点検。感電・火災リスクの予防が目的。",
    category: "電気機器",
    recommendedInterval: "1か月ごと",
    items: [
      { label: "電源ケーブル・ホルダーの損傷", itemType: "ok_ng", instruction: "被覆の破れ・芯線露出は使用中止。", photoMode: "optional", requireCommentOnNg: true },
      { label: "アース（接地）クランプの状態", itemType: "ok_ng", instruction: "締付け・導通、ばねのへたりを確認。" },
      { label: "端子部の緩み・変色", itemType: "ok_ng", instruction: "入力・出力端子の緩み、過熱による変色がないこと。" },
      { label: "絶縁抵抗", itemType: "numeric", instruction: "500Vメガーで充電部〜外箱間を測定（電源遮断後）。", unit: "MΩ", min: 1 },
      { label: "冷却ファンの回転・異音", itemType: "ok_ng", instruction: "通電時にファンが回り、粉塵詰まりがないこと。" },
      { label: "本体内部の粉塵清掃", itemType: "ok_ng", instruction: "エアブローで内部の金属粉を除去（絶縁劣化の主因）。" },
      { label: "トーチ先端・消耗品", itemType: "ok_ng", instruction: "チップ・ノズルの摩耗、ワイヤ送給のスリップがないこと。" },
    ],
  },
  {
    key: "motor-monthly",
    name: "三相モーター 月次点検",
    description: "汎用三相誘導電動機の月例点検。温度・電流・絶縁で劣化を早期発見。",
    category: "電気機器",
    recommendedInterval: "1か月ごと",
    items: [
      { label: "異音・異常振動", itemType: "ok_ng", instruction: "軸受のうなり・ゴロつき音があれば NG。", requireCommentOnNg: true },
      { label: "表面温度", itemType: "numeric", instruction: "放射温度計でフレーム表面を測定。", unit: "℃", max: 80 },
      { label: "電流値", itemType: "numeric", instruction: "クランプメータで測定。銘板定格以下・三相の偏り10%以内。", unit: "A" },
      { label: "絶縁抵抗", itemType: "numeric", instruction: "停止・遮断後に500Vメガーで巻線〜接地間を測定。", unit: "MΩ", min: 1 },
      { label: "冷却フィン・ファンカバーの粉塵", itemType: "ok_ng", instruction: "目詰まりは過熱の原因。清掃する。" },
      { label: "端子箱の緩み・浸水痕", itemType: "ok_ng", instruction: "端子の増し締め、パッキン劣化・錆を確認。" },
      { label: "軸受の給脂状態", itemType: "ok_ng", instruction: "給脂式は適量を補給（銘柄・量は銘板指示に従う）。" },
    ],
  },
];

export function getProcedureTemplate(key: string): ProcedureTemplate | undefined {
  return PROCEDURE_TEMPLATES.find((t) => t.key === key);
}
