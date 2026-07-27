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
  /**
   * 点検箇所の見本写真（どの計器を見るか）。public/ 配下に同梱した静的アセットの絶対パス。
   * アップロード物ではないので削除対象外（actions.ts の deleteBlobs でフィルタ）。
   */
  spotPhotoUrl?: string;
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
  {
    key: "diecast-daily",
    name: "ダイカストマシン 日常点検",
    description:
      "東洋機械金属 BD・DS/125・250・350・500/V5EX・EX ダイカストマシンの日常点検（整理番号 D1D-002-A / 帳票 J-210）。判定は良好=○（OK）／不具合=×（NG）、数値項目は測定値を記入。各項目は設備使用前に実施する。",
    category: "ダイカスト",
    recommendedInterval: "毎日（始業前）",
    items: [
      { label: "非常停止は確実に作動するか", itemType: "ok_ng", instruction: "設備使用前に確認。作動不良は使用禁止。", requireCommentOnNg: true },
      { label: "安全装置は確実に作動するか", itemType: "ok_ng", instruction: "各安全装置の作動を確認。", requireCommentOnNg: true },
      { label: "高速LS位置（数値記入）", itemType: "numeric", instruction: "高速リミットスイッチ位置を数値で記入。" },
      { label: "増圧LS位置（数値記入）", itemType: "numeric", instruction: "増圧リミットスイッチ位置を数値で記入。" },
      { label: "ACCサージ圧", itemType: "numeric", instruction: "160kgf/cm²以上ないと不良。測定値を記入。", unit: "kgf/cm²", min: 160 },
      { label: "チップ潤滑剤は出ているか（吹付位置）", itemType: "ok_ng", instruction: "吹付位置と吐出を目視確認。" },
      { label: "作動油量・温度は良いか", itemType: "ok_ng", instruction: "油温 15〜55℃。補給した場合は備考に「ホ（補給）」を記入。" },
      { label: "取出し機・トリムのオイル量は1/4以上あるか", itemType: "ok_ng", instruction: "オイルゲージが1/4以上あること。" },
      { label: "トグル潤滑剤は5目盛以上あるか", itemType: "ok_ng", instruction: "潤滑剤タンクが5目盛以上あること。" },
      { label: "ポンプ圧力計確認", itemType: "numeric", instruction: "10〜15MPaの範囲か測定値を記入。", unit: "MPa", min: 10, max: 15, photoMode: "optional" },
      { label: "エアー圧力・漏れは無いか", itemType: "numeric", instruction: "4〜5kg/cm²（0.4〜0.5MPa）。漏れが無いことも確認。", unit: "MPa", min: 0.4, max: 0.5 },
      { label: "作動油の洩れは無いか", itemType: "ok_ng", instruction: "配管・シリンダー部の油漏れを目視・指触で確認。" },
      { label: "取出し機 動作不良は無いか（ワーク傾き無いか）", itemType: "ok_ng", instruction: "取出し動作とワークの傾きを確認。" },
      { label: "タンク内の離型剤量・色はよいか", itemType: "ok_ng", instruction: "離型剤の残量と色を確認。" },
      { label: "溶湯温度は正常か", itemType: "numeric", instruction: "660〜690℃の範囲か測定値を記入。", unit: "℃", min: 660, max: 690 },
      { label: "水溶性圧送圧力", itemType: "numeric", instruction: "0.1MPa以上。測定値を記入。", unit: "MPa", min: 0.1 },
      { label: "原液圧送圧力", itemType: "numeric", instruction: "0.05MPa以上。測定値を記入。", unit: "MPa", min: 0.05 },
      { label: "真空装置の電源は入っているか／動作時に針が動くか", itemType: "ok_ng", instruction: "電源投入と動作時の針の振れを確認。" },
      { label: "分流子・スリーブ冷却水は出ているか（漏れ確認）", itemType: "ok_ng", instruction: "冷却水の吐出と漏れを確認。" },
      { label: "【週1回】セラミックラドル：ナット弛み・ヒビ・欠けは無いか", itemType: "ok_ng", instruction: "週1回の点検項目。ナットの弛み、ヒビ、欠けを確認。", requireCommentOnNg: true },
    ],
  },
  {
    key: "diecast-monthly",
    name: "ダイカストマシン 月次点検（設備点検）",
    description:
      "東洋機械金属 ダイカストマシンの設備点検（整理番号 ZK-277 / 帳票 Z-008）。月次を基本とし、周期の異なる3ヶ月・6ヶ月項目は先頭に【3ヶ月ごと】【6ヶ月ごと】と明記。判定は良好=○（OK）／不具合=×（NG）。ロボットスプレー・ロボット取出し機の点検はZK-305で行う。",
    category: "ダイカスト",
    recommendedInterval: "1か月ごと",
    items: [
      { label: "圧力計：指針は0〜0.5MPa（0〜5kgf/cm²）の間か", itemType: "ok_ng", instruction: "目視。指針が規定範囲内にあること。" },
      { label: "可動プラテン摺動面：ライナーかじり・引張りボルトの緩みは無いか", itemType: "ok_ng", instruction: "目視・指触で確認。" },
      { label: "油圧ポンプ圧力", itemType: "numeric", instruction: "設定圧力通りか（120〜150kgf/cm²）。測定値を記入。", unit: "MPa", min: 12, max: 15 },
      { label: "油洩れ：射出シリンダー部周り", itemType: "ok_ng", instruction: "目視・指触で油漏れを確認。" },
      { label: "増圧保持：タイマー2〜3秒で確実に保持（※DS・EX）", itemType: "ok_ng", instruction: "目視。増圧の保持時間を確認。" },
      { label: "スプレー：フィルター・ストレーナーの清掃又は交換", itemType: "ok_ng", instruction: "清掃または交換を実施。" },
      { label: "SW・ランプ：コゲ・埃・異音（切換時）・ガタ・破損は無いか", itemType: "ok_ng", instruction: "目視・聴音で確認。" },
      { label: "給湯機アーム：前進時に射出ロッド（チップ）と干渉は無いか", itemType: "ok_ng", instruction: "目視で干渉を確認。" },
      { label: "冷却ファン・フィルター：回転確認・フィルター清掃", itemType: "ok_ng", instruction: "目視・聴音でファン回転を確認し、フィルターを清掃。" },
      { label: "エアー通路部：エアー漏れ確認・交換", itemType: "ok_ng", instruction: "聴音・指触で漏れを確認。" },
      { label: "Acc.N₂充填圧（高速Acc）", itemType: "numeric", instruction: "充填圧力確保 7.8MPa±0.2。測定値を記入。", unit: "MPa", min: 7.6, max: 8.0 },
      { label: "Acc.N₂充填圧（増圧Acc ※Ds・EXのみ）", itemType: "numeric", instruction: "増圧Acc 5.9MPa±0.2。Ds・EXのみ。測定値を記入。", unit: "MPa", min: 5.7, max: 6.1 },
      { label: "離型剤圧送装置：装置点検・希釈液タンク清掃／濃度チェック", itemType: "ok_ng", instruction: "装置を点検し希釈液タンクを清掃。分光光度計で濃度チェック（希釈倍率を備考に記載）。" },
      { label: "型締機構各部他：説明書指定部にグリスアップ", itemType: "ok_ng", instruction: "取説指定部へグリスアップを実施。" },
      { label: "裏ブキ装置：各ノズルのチェック・掃除", itemType: "ok_ng", instruction: "各ノズルを点検し掃除。" },
      { label: "温調器：水漏れ・フィルター等を取説に沿ってチェック", itemType: "ok_ng", instruction: "取説に沿って水漏れ・フィルター等を点検。" },
      { label: "【3ヶ月ごと】ポンプ・サクションフィルター：エレメント清掃・オイルクリーナ用エレメント交換（メーカー依頼）", itemType: "ok_ng", instruction: "3ヶ月周期。メーカー依頼で実施。" },
      { label: "【3ヶ月ごと】ポンプ・サクションフィルター：エレメント清掃・オイルクリーナ用エレメント交換", itemType: "ok_ng", instruction: "3ヶ月周期。点検・実施。" },
      { label: "【6ヶ月ごと】難燃性作動油：性状検査及び処置（水・アルカリ追加）（メーカー依頼）", itemType: "ok_ng", instruction: "6ヶ月周期。メーカー依頼で性状検査・処置。" },
      { label: "【6ヶ月ごと】給湯機チェーン：異音・（交換）・挙動確認", itemType: "ok_ng", instruction: "6ヶ月周期。目視・聴音で確認、必要に応じ交換。" },
      { label: "【6ヶ月ごと】射出部：タイミングベルト張り具合・歯の摩耗は無いか（※DS）", itemType: "ok_ng", instruction: "6ヶ月周期。マニュアル参照・メーカー依頼。" },
      { label: "【6ヶ月ごと】トリム等周辺機械：摺動部摩耗確認・部品交換等", itemType: "ok_ng", instruction: "6ヶ月周期。マニュアル参照・メーカー依頼。" },
    ],
  },
  {
    key: "oxynon-daily",
    name: "オキシノン炉 日常点検",
    description:
      "関東冶金工業 オキシノン炉の日常，週 設備点検チェックシート（整理番号 D1N-063-A / 職場 大口 内同 / 帳票 J-210(4)）。判定は良好=○（OK）／不具合=×（NG）。安全・駆動部の項目は設備使用前に実施し、「条件」の数値項目（※）は運転中に実測値を記入する。不具合がある場合は直ちに責任者へ連絡し、処置が済むまで使用しない。主要な計器には点検箇所の見本写真を添付。",
    category: "熱処理炉",
    recommendedInterval: "毎日（始業前）",
    items: [
      // ===== 安全・駆動部（設備使用前に実施） =====
      { label: "非常停止ボタンを押して運転準備が落ちるか", itemType: "ok_ng", instruction: "安全。非常停止ボタンで運転準備が確実に落ちること。", requireCommentOnNg: true },
      { label: "安全カバーが確実に取付され破損がないか", itemType: "ok_ng", instruction: "安全。取付状態と破損を目視確認。" },
      { label: "設備内に不要な物が無いか", itemType: "ok_ng", instruction: "安全。設備内の異物・不要物を確認。" },
      { label: "コンベア動作中に異音が無いか", itemType: "ok_ng", instruction: "駆動部。動作中の異音を確認。" },
      { label: "アルゴンガス使用量（雰囲気ガス増量弁が「開」）", itemType: "numeric", instruction: "安全。増量弁が「開」で 30〜50m³/h。測定値を記入。", unit: "m³/h", min: 30, max: 50, spotPhotoUrl: "/templates/oxynon/argon-flowmeter.png" },
      { label: "O2濃度：アラートの発生が無いか", itemType: "ok_ng", instruction: "安全。O2濃度アラートが発生していないこと。", requireCommentOnNg: true, spotPhotoUrl: "/templates/oxynon/o2-meter.png" },
      { label: "CO濃度：アラートの発生が無いか", itemType: "ok_ng", instruction: "安全。CO濃度アラートが発生していないこと。", requireCommentOnNg: true, spotPhotoUrl: "/templates/oxynon/co-meter.png" },
      { label: "炉内圧力：アラートの発生が無いか", itemType: "ok_ng", instruction: "安全。炉内圧力アラートが発生していないこと。", requireCommentOnNg: true, spotPhotoUrl: "/templates/oxynon/control-panel.png" },
      { label: "炉内温度・乾燥炉温度：アラートの発生が無いか", itemType: "ok_ng", instruction: "安全。炉内温度・乾燥炉温度アラートが発生していないこと。", requireCommentOnNg: true, spotPhotoUrl: "/templates/oxynon/control-panel.png" },

      // ===== 条件 ※数値記入（運転中に実測値を記入） =====
      { label: "CO濃度", itemType: "numeric", instruction: "条件（※数値記入）。CO濃度計の表示値を記入。規格 1ppm以下。", unit: "ppm", max: 1, spotPhotoUrl: "/templates/oxynon/co-meter.png" },
      { label: "酸素濃度", itemType: "numeric", instruction: "条件（※数値記入）。酸素濃度計の表示値を記入。規格 200ppm以下。", unit: "ppm", max: 200, spotPhotoUrl: "/templates/oxynon/o2-meter.png" },
      { label: "コンベアスピード", itemType: "numeric", instruction: "条件（※数値記入）。操作盤の表示値を記入。規格 220〜240mm/min。", unit: "mm/min", min: 220, max: 240, spotPhotoUrl: "/templates/oxynon/control-panel.png" },
      { label: "循環水温度", itemType: "numeric", instruction: "条件（※数値記入）。規格 35℃以下。", unit: "℃", max: 35, spotPhotoUrl: "/templates/oxynon/control-panel.png" },
      { label: "循環水圧力", itemType: "numeric", instruction: "条件（※数値記入）。圧力計の指示値を記入。規格 1.0MPa±0.1MPa。", unit: "MPa", min: 0.9, max: 1.1, spotPhotoUrl: "/templates/oxynon/water-pressure-gauge.png" },
      { label: "乾燥炉温度①", itemType: "numeric", instruction: "条件（※数値記入）。規格 200℃±10℃。", unit: "℃", min: 190, max: 210, spotPhotoUrl: "/templates/oxynon/control-panel.png" },
      { label: "乾燥炉温度②", itemType: "numeric", instruction: "条件（※数値記入）。規格 230℃±10℃。", unit: "℃", min: 220, max: 240, spotPhotoUrl: "/templates/oxynon/control-panel.png" },
      { label: "脱バインダー温度①", itemType: "numeric", instruction: "条件（※数値記入）。規格 200℃±10℃。", unit: "℃", min: 190, max: 210, spotPhotoUrl: "/templates/oxynon/control-panel.png" },
      { label: "脱バインダー温度②", itemType: "numeric", instruction: "条件（※数値記入）。規格 500℃±10℃。", unit: "℃", min: 490, max: 510, spotPhotoUrl: "/templates/oxynon/control-panel.png" },
      { label: "脱バインダー温度③", itemType: "numeric", instruction: "条件（※数値記入）。規格 500℃±10℃。", unit: "℃", min: 490, max: 510, spotPhotoUrl: "/templates/oxynon/control-panel.png" },
      { label: "加熱炉①", itemType: "numeric", instruction: "条件（※数値記入）。規格 950℃±10℃。", unit: "℃", min: 940, max: 960, spotPhotoUrl: "/templates/oxynon/control-panel.png" },
      { label: "加熱炉②", itemType: "numeric", instruction: "条件（※数値記入）。規格 1050℃±10℃。", unit: "℃", min: 1040, max: 1060, spotPhotoUrl: "/templates/oxynon/control-panel.png" },
      { label: "加熱炉③", itemType: "numeric", instruction: "条件（※数値記入）。規格 1090℃±10℃。", unit: "℃", min: 1080, max: 1100, spotPhotoUrl: "/templates/oxynon/control-panel.png" },
      { label: "加熱炉④", itemType: "numeric", instruction: "条件（※数値記入）。規格 1090℃±10℃。", unit: "℃", min: 1080, max: 1100, spotPhotoUrl: "/templates/oxynon/control-panel.png" },
      { label: "アルゴンガス流量 入口内扉", itemType: "numeric", instruction: "条件（※数値記入）。流量計の指示値を記入。規格 10.5±0.1㎥/h。", unit: "㎥/h", min: 10.4, max: 10.6, spotPhotoUrl: "/templates/oxynon/argon-flowmeter.png" },
      { label: "アルゴンガス流量 前室", itemType: "numeric", instruction: "条件（※数値記入）。流量計の指示値を記入。規格 5.5±0.1㎥/h。", unit: "㎥/h", min: 5.4, max: 5.6, spotPhotoUrl: "/templates/oxynon/argon-flowmeter.png" },
      { label: "アルゴンガス流量 中間室", itemType: "numeric", instruction: "条件（※数値記入）。流量計の指示値を記入。規格 3.0±0.1㎥/h。", unit: "㎥/h", min: 2.9, max: 3.1, spotPhotoUrl: "/templates/oxynon/argon-flowmeter.png" },
      { label: "アルゴンガス流量 端子箱（RH）", itemType: "numeric", instruction: "条件（※数値記入）。流量計の指示値を記入。規格 1.0±0.1㎥/h。", unit: "㎥/h", min: 0.9, max: 1.1, spotPhotoUrl: "/templates/oxynon/argon-flowmeter.png" },
      { label: "アルゴンガス流量 端子箱（LH）", itemType: "numeric", instruction: "条件（※数値記入）。流量計の指示値を記入。規格 1.0±0.1㎥/h。", unit: "㎥/h", min: 0.9, max: 1.1, spotPhotoUrl: "/templates/oxynon/argon-flowmeter.png" },
      { label: "アルゴンガス流量 冷却室", itemType: "numeric", instruction: "条件（※数値記入）。流量計の指示値を記入。規格 5.0±0.1㎥/h。", unit: "㎥/h", min: 4.9, max: 5.1, spotPhotoUrl: "/templates/oxynon/argon-flowmeter.png" },
      { label: "アルゴンガス流量 後ろ室", itemType: "numeric", instruction: "条件（※数値記入）。流量計の指示値を記入。規格 5.0±0.1㎥/h。", unit: "㎥/h", min: 4.9, max: 5.1, spotPhotoUrl: "/templates/oxynon/argon-flowmeter.png" },
      { label: "アルゴンガス流量 出口内扉", itemType: "numeric", instruction: "条件（※数値記入）。流量計の指示値を記入。規格 5.0±0.1㎥/h。", unit: "㎥/h", min: 4.9, max: 5.1, spotPhotoUrl: "/templates/oxynon/argon-flowmeter.png" },
    ],
  },
  {
    key: "oxynon-monthly",
    name: "オキシノン炉 月次点検（設備点検）",
    description:
      "関東冶金工業 オキシノン炉の設備点検（整理番号 ZK-845 / 帳票 Z-008）。周期は毎月。判定は良好=○（OK）／不具合=×（NG）、アラーム設定値・速度などの数値項目は測定値を記入。",
    category: "熱処理炉",
    recommendedInterval: "1か月ごと",
    items: [
      { label: "加熱室：各ボルトの増締め", itemType: "ok_ng", instruction: "増締めを実施。" },
      { label: "駆動部：コンベア動作中に異音が無いか", itemType: "ok_ng", instruction: "目視・聴音で確認。" },
      { label: "全般：非常停止ボタンを押して運転準備が落ちるか", itemType: "ok_ng", instruction: "目視で運転準備の落ちを確認。" },
      { label: "全般：安全カバーに破損がないか", itemType: "ok_ng", instruction: "目視で破損を確認。" },
      { label: "全般：設備内に不要な物が無いか", itemType: "ok_ng", instruction: "目視で異物・不要物を確認。" },
      { label: "制御盤：O2濃度アラーム設定値（100ppm以下）", itemType: "numeric", instruction: "設定値が100ppm以下であること。測定値を記入。", unit: "ppm", max: 100 },
      { label: "制御盤：CO濃度アラーム設定値（1000ppm以下）", itemType: "numeric", instruction: "設定値が1000ppm以下であること。測定値を記入。", unit: "ppm", max: 1000 },
      { label: "乾燥炉温度 Zone1 アラーム設定値（100〜300℃）", itemType: "numeric", instruction: "設定値を記入。", unit: "℃", min: 100, max: 300 },
      { label: "乾燥炉温度 Zone2 アラーム設定値（130〜330℃）", itemType: "numeric", instruction: "設定値を記入。", unit: "℃", min: 130, max: 330 },
      { label: "炉温度 前室 アラーム設定値（50〜350℃）", itemType: "numeric", instruction: "設定値を記入。", unit: "℃", min: 50, max: 350 },
      { label: "炉温度 排ガス燃焼室 アラーム設定値（700〜850℃）", itemType: "numeric", instruction: "設定値を記入。", unit: "℃", min: 700, max: 850 },
      { label: "炉温度 脱バインダー炉 Zone1 アラーム設定値（400〜600℃）", itemType: "numeric", instruction: "設定値を記入。", unit: "℃", min: 400, max: 600 },
      { label: "炉温度 脱バインダー炉 Zone2 アラーム設定値（450〜650℃）", itemType: "numeric", instruction: "設定値を記入。", unit: "℃", min: 450, max: 650 },
      { label: "炉温度 加熱炉 Zone1 アラーム設定値（900〜1000℃）", itemType: "numeric", instruction: "設定値を記入。※原本は「900〜100℃」と記載。誤記の可能性があり基準値は要確認。", unit: "℃", min: 900, max: 1000 },
      { label: "炉温度 加熱炉 Zone2 アラーム設定値（1000〜1100℃）", itemType: "numeric", instruction: "設定値を記入。", unit: "℃", min: 1000, max: 1100 },
      { label: "炉温度 加熱炉 Zone3 アラーム設定値（1080〜1180℃）", itemType: "numeric", instruction: "設定値を記入。", unit: "℃", min: 1080, max: 1180 },
      { label: "炉温度 加熱炉 Zone4 アラーム設定値（1080〜1180℃）", itemType: "numeric", instruction: "設定値を記入。", unit: "℃", min: 1080, max: 1180 },
      { label: "ベルト速度（170〜270cm/min）", itemType: "numeric", instruction: "測定値を記入。", unit: "cm/min", min: 170, max: 270 },
    ],
  },
];

export function getProcedureTemplate(key: string): ProcedureTemplate | undefined {
  return PROCEDURE_TEMPLATES.find((t) => t.key === key);
}
