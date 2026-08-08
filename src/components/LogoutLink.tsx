"use client";

import { signOut } from "next-auth/react";

/** ログアウト（ログイン中のみ意味を持つ。未ログインでも /login へ遷移するだけ）。 */
export default function LogoutLink({
  label = "ログアウト",
  className = "font-medium text-slate-500 underline hover:no-underline",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <button type="button" onClick={() => { void signOut({ redirect: false }).then(() => { window.location.href = "https://portal.paloma-pf.com/?logout=1"; }); }} className={className}>
      {label}
    </button>
  );
}
