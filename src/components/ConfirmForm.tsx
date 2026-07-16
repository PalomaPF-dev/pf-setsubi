"use client";

/** Server Action を実行する form。送信前に confirm() で確認する。 */
export default function ConfirmForm({
  action,
  message,
  children,
  className = "",
}: {
  action: (formData: FormData) => void | Promise<void>;
  message: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
      className={className}
    >
      {children}
    </form>
  );
}
