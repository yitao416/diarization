type Props = { message: string | null; onClose: () => void };

export function ErrorToast({ message, onClose }: Props) {
  if (!message) return null;
  return (
    <div style={{
      position: "fixed",
      top: 16,
      left: "50%",
      transform: "translateX(-50%)",
      background: "var(--bg-elev-2)",
      border: "1px solid var(--error)",
      borderRadius: "var(--radius)",
      padding: "8px 12px",
      display: "flex",
      gap: 12,
      alignItems: "center",
      zIndex: 100,
      maxWidth: "80vw",
    }}>
      <span style={{ color: "var(--error)", fontSize: 26 }}>{message}</span>
      <button onClick={onClose} style={{ fontSize: 22 }}>✕</button>
    </div>
  );
}
