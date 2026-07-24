/**
 * 作業者名の入力フィールド（Server Component から使用可）。
 * 作業者アカウント（users の role='worker'）が登録されていればセレクト、空なら従来どおりの自由入力。
 * 保存される値はどちらも氏名の文字列で、データ形状は変わらない。
 * fixedValue を渡すと本人名で固定表示（worker ログイン用。サーバー側でも強制される）。
 */
export default function WorkerSelectField({
  name,
  workers,
  defaultValue = "",
  placeholder,
  className,
  required = false,
  fixedValue = null,
}: {
  name: string;
  workers: string[];
  defaultValue?: string;
  placeholder?: string;
  className?: string;
  required?: boolean;
  fixedValue?: string | null;
}) {
  if (fixedValue) {
    return <input name={name} value={fixedValue} readOnly className={className} />;
  }
  if (workers.length === 0) {
    return (
      <input
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        className={className}
      />
    );
  }
  // 名簿に無い既存値も選択肢に残す（編集時に消えて見えるのを防ぐ）
  const extra = defaultValue && !workers.includes(defaultValue) ? defaultValue : null;
  return (
    <select name={name} defaultValue={defaultValue} required={required} className={className}>
      <option value="">選択してください</option>
      {extra && <option value={extra}>{extra}</option>}
      {workers.map((w) => (
        <option key={w} value={w}>
          {w}
        </option>
      ))}
    </select>
  );
}
