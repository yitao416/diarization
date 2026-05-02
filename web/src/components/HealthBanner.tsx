type Props = { loaded: boolean };

export function HealthBanner({ loaded }: Props) {
  if (loaded) return null;
  return (
    <div style={{
      background: "var(--bg-elev-2)",
      borderBottom: "1px solid var(--border)",
      padding: "6px 16px",
      fontSize: 12,
      color: "var(--fg-dim)",
    }}>
      models loading… the run button will enable when ready
    </div>
  );
}
