/**
 * オンプレ版の判定。ON_PREMISE=1 のとき課金ゲートを無効化する（entitlement.ts）。
 * env が無ければクラウド版の挙動のまま。
 */
export const isOnPremise = (): boolean => process.env.ON_PREMISE === "1";
