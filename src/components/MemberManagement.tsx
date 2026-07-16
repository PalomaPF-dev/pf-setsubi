"use client";

import { useCallback, useEffect, useState } from "react";
import { Users, UserPlus, Trash2, Loader2, Copy, Check, KeyRound, Factory } from "lucide-react";

type Member = {
  id: string;
  loginId: string | null;
  email: string | null;
  name: string;
  role: "admin" | "member";
  pending: boolean;
  factory: string | null;
  createdAt: string;
};

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500";

/**
 * メンバー管理（管理者限定）。
 * 一覧の取得・招待（アカウント発行）・削除・所属工場の変更を行う。権限チェックは API 側で担保。
 * メールが飛ばない社内環境向けに、招待成功時は招待リンク（inviteUrl）をその場で表示・コピーできる。
 * factoryNames は工場マスタ（sites）の名称一覧。あればセレクト、無ければテキスト入力になる。
 */
export default function MemberManagement({
  myUserId,
  factoryNames = [],
}: {
  myUserId: string;
  factoryNames?: string[];
}) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [loadError, setLoadError] = useState("");

  // 招待フォーム
  const [loginId, setLoginId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [factory, setFactory] = useState("");
  const [inviting, setInviting] = useState(false);
  const [formError, setFormError] = useState("");
  // 設定リンクの表示（招待時・再発行時で共用）
  const [inviteUrl, setInviteUrl] = useState("");
  const [invitedName, setInvitedName] = useState("");
  const [linkKind, setLinkKind] = useState<"invite" | "reissue">("invite");
  const [linkMailed, setLinkMailed] = useState(false);
  const [copied, setCopied] = useState(false);

  const [deletingId, setDeletingId] = useState("");
  const [reissuingId, setReissuingId] = useState("");
  const [factorySavingId, setFactorySavingId] = useState("");

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const res = await fetch("/api/members");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setMembers(data.members as Member[]);
    } catch {
      setLoadError("メンバー一覧の取得に失敗しました。画面を更新してください。");
      setMembers([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onInvite(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setInviteUrl("");
    setCopied(false);
    setInviting(true);
    try {
      const res = await fetch("/api/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginId, name, email, role, factory }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(data.message || "招待に失敗しました。");
        setInviting(false);
        return;
      }
      setInviteUrl(data.inviteUrl || "");
      setInvitedName(name);
      setLinkKind("invite");
      setLinkMailed(Boolean(email.trim()));
      setLoginId("");
      setName("");
      setEmail("");
      setRole("member");
      setFactory("");
      await load();
    } catch {
      setFormError("通信エラーが発生しました。");
    } finally {
      setInviting(false);
    }
  }

  async function onDelete(m: Member) {
    if (deletingId) return;
    if (!confirm(`「${m.name}」さんのアカウントを削除しますか？この操作は元に戻せません。`)) return;
    setDeletingId(m.id);
    try {
      const res = await fetch(`/api/members/${m.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.message || "削除に失敗しました。");
        setDeletingId("");
        return;
      }
      await load();
    } catch {
      alert("通信エラーが発生しました。");
    } finally {
      setDeletingId("");
    }
  }

  /** パスワード設定リンクの再発行（メール未登録者・メール不達時の救済）。 */
  async function onReissue(m: Member) {
    if (reissuingId) return;
    if (!confirm(`「${m.name}」さんのパスワード設定リンクを再発行しますか？`)) return;
    setReissuingId(m.id);
    try {
      const res = await fetch(`/api/members/${m.id}/reset-link`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.message || "再発行に失敗しました。");
        return;
      }
      setInviteUrl(data.resetUrl || "");
      setInvitedName(m.name);
      setLinkKind("reissue");
      setLinkMailed(Boolean(m.email));
      setCopied(false);
    } catch {
      alert("通信エラーが発生しました。");
    } finally {
      setReissuingId("");
    }
  }

  /** 所属工場の変更（空欄 = 全工場）。 */
  async function onChangeFactory(m: Member, next: string) {
    if (factorySavingId) return;
    setFactorySavingId(m.id);
    try {
      const res = await fetch(`/api/members/${m.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ factory: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.message || "所属工場の変更に失敗しました。");
        return;
      }
      await load();
    } catch {
      alert("通信エラーが発生しました。");
    } finally {
      setFactorySavingId("");
    }
  }

  /** 工場マスタが無い環境向け: テキストで所属工場を変更。 */
  function onEditFactoryText(m: Member) {
    const next = prompt(
      `「${m.name}」さんの所属工場を入力してください（空欄 = 全工場）`,
      m.factory ?? ""
    );
    if (next === null) return; // キャンセル
    onChangeFactory(m, next.trim());
  }

  async function copyInviteUrl() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* クリップボード不可の環境では手動選択でコピーしてもらう */
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold text-slate-700">
        <Users className="h-4 w-4 text-orange-500" />
        メンバー（アカウント管理）
      </h2>
      <p className="mb-4 text-xs text-slate-400">
        社員のアカウントを社員番号で発行・削除します。発行時に表示される「パスワード設定リンク」を本人にお伝えください（メールアドレスを登録した場合は招待メールも届きます）。
        本人がパスワードを設定すると、社員番号＋パスワードでログインできます。
      </p>

      {/* 一覧 */}
      {members === null ? (
        <div className="mb-4 flex items-center justify-center gap-2 py-6 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          読み込み中…
        </div>
      ) : loadError ? (
        <p className="mb-4 rounded-xl border border-dashed border-red-200 bg-red-50 py-4 text-center text-sm text-red-600">
          {loadError}
        </p>
      ) : members.length === 0 ? (
        <p className="mb-4 rounded-xl border border-dashed border-slate-300 py-6 text-center text-sm text-slate-400">
          メンバーはまだいません。
        </p>
      ) : (
        <ul className="mb-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium text-slate-800">{m.name}</span>
                  {m.role === "admin" ? (
                    <span className="shrink-0 rounded bg-orange-50 px-1.5 py-0.5 text-xs font-medium text-orange-700">
                      管理者
                    </span>
                  ) : (
                    <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
                      一般
                    </span>
                  )}
                  {m.pending ? (
                    <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                      招待中
                    </span>
                  ) : (
                    <span className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-700">
                      有効
                    </span>
                  )}
                  {m.id === myUserId && (
                    <span className="shrink-0 text-xs text-slate-400">（あなた）</span>
                  )}
                </div>
                <div className="truncate text-xs text-slate-400">
                  社員番号: {m.loginId ?? "—"}
                  {m.email ? ` ／ ${m.email}` : ""}
                </div>
                {/* 所属工場（空欄 = 全工場を閲覧可。設定すると自工場のデータのみ表示） */}
                <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                  <Factory className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  {factoryNames.length > 0 ? (
                    <select
                      value={m.factory ?? ""}
                      disabled={factorySavingId === m.id}
                      onChange={(e) => onChangeFactory(m, e.target.value)}
                      className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs text-slate-600 focus:border-orange-500 focus:outline-none disabled:opacity-50"
                      aria-label="所属工場"
                    >
                      <option value="">全工場</option>
                      {/* マスタに無い既存値も選択肢に残す（消えて見えるのを防ぐ） */}
                      {m.factory && !factoryNames.includes(m.factory) && (
                        <option value={m.factory}>{m.factory}</option>
                      )}
                      {factoryNames.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onEditFactoryText(m)}
                      disabled={factorySavingId === m.id}
                      className="rounded border border-slate-200 px-1.5 py-0.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                      title="クリックで所属工場を変更（空欄 = 全工場）"
                    >
                      {m.factory ?? "全工場"}
                    </button>
                  )}
                  {factorySavingId === m.id && (
                    <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onReissue(m)}
                disabled={reissuingId === m.id}
                className="inline-flex shrink-0 items-center gap-1 rounded border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-orange-50 hover:text-orange-700 disabled:opacity-40"
                title="パスワード設定リンクを再発行します（パスワードを忘れた方・メール未登録の方向け）"
              >
                {reissuingId === m.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <KeyRound className="h-3.5 w-3.5" />
                )}
                設定リンク再発行
              </button>
              {m.id !== myUserId && (
                <button
                  type="button"
                  onClick={() => onDelete(m)}
                  disabled={deletingId === m.id}
                  className="rounded p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
                  aria-label="削除"
                >
                  {deletingId === m.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* 設定リンクの表示（招待時・再発行時。メール未達／未登録環境向け） */}
      {inviteUrl && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-medium text-emerald-800">
            {linkKind === "reissue"
              ? invitedName
                ? `「${invitedName}」さんのパスワード設定リンクを再発行しました。`
                : "パスワード設定リンクを再発行しました。"
              : invitedName
                ? `「${invitedName}」さんのアカウントを発行しました。`
                : "アカウントを発行しました。"}
          </p>
          <p className="mt-1 text-xs text-emerald-700">
            {linkMailed
              ? "案内メールを送信しました。メールが届かない場合は、下のリンクを本人にお伝えください（7日以内に開いてパスワードを設定してもらいます）。"
              : "メール未登録のため、下のリンクを本人に直接お伝えください（7日以内に開いてパスワードを設定してもらいます）。"}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <input
              readOnly
              value={inviteUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-lg border border-emerald-300 bg-white px-3 py-2 font-mono text-xs text-slate-700"
            />
            <button
              type="button"
              onClick={copyInviteUrl}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "コピーしました" : "リンクをコピー"}
            </button>
          </div>
        </div>
      )}

      {/* 招待フォーム */}
      <form onSubmit={onInvite} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="mb-3 flex items-center gap-1.5 text-sm font-medium text-slate-600">
          <UserPlus className="h-4 w-4 text-orange-500" />
          新しいメンバーを追加
        </div>
        <div className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">社員番号</label>
            <input
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              required
              pattern="[A-Za-z0-9_\-]+"
              title="半角英数字とハイフン・アンダースコアのみ"
              placeholder="例: 12345"
              className={inputCls}
            />
            <p className="mt-1 text-[11px] text-slate-400">
              ログインに使うIDです（半角英数字と - _ のみ）。
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">お名前</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="山田 太郎"
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              メールアドレス（任意）
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com（未入力ならリンクを直接お伝えください）"
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">役割</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "admin" | "member")}
              className={inputCls}
            >
              <option value="member">一般（点検・記録ができます）</option>
              <option value="admin">管理者（メンバーの追加・削除もできます）</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              所属工場（任意・空欄 = 全工場）
            </label>
            {factoryNames.length > 0 ? (
              <select
                value={factory}
                onChange={(e) => setFactory(e.target.value)}
                className={inputCls}
              >
                <option value="">全工場（制限なし・本部スタッフ等）</option>
                {factoryNames.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={factory}
                onChange={(e) => setFactory(e.target.value)}
                maxLength={100}
                placeholder="例: 第一工場（未入力なら全工場を閲覧できます）"
                className={inputCls}
              />
            )}
            <p className="mt-1 text-[11px] text-slate-400">
              所属工場を設定した一般メンバーは、その工場のデータだけが表示されます（管理者は常に全工場）。
            </p>
          </div>
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <button
            type="submit"
            disabled={inviting}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#f27524] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#c6601e] disabled:opacity-60"
          >
            {inviting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                追加中…
              </>
            ) : (
              <>
                <UserPlus className="h-4 w-4" />
                この内容でアカウントを発行
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
