import { useRef, useState } from "react";

type Props = {
  onFile: (file: File) => void;
};

export function Uploader({ onFile }: Props) {
  const [hover, setHover] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setHover(true); }}
      onDragLeave={() => setHover(false)}
      onDrop={(e) => {
        e.preventDefault();
        setHover(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      onClick={() => inputRef.current?.click()}
      style={{
        border: `1px dashed ${hover ? "var(--accent)" : "var(--border)"}`,
        borderRadius: "var(--radius)",
        padding: "48px 16px",
        textAlign: "center",
        color: hover ? "var(--accent)" : "var(--fg-dim)",
        background: hover ? "var(--bg-elev)" : "transparent",
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      <div style={{ fontSize: 14 }}>drop an audio file or click to choose</div>
      <div className="dim" style={{ fontSize: 11, marginTop: 6 }}>
        wav · flac · mp3 · m4a — anything ffmpeg reads
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
