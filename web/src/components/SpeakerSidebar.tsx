import type { DiarizeResponse } from "../types";
import { speakersOf } from "../types";
import { SpeakerCard } from "./SpeakerCard";

type Props = {
  result: DiarizeResponse;
  renames: Record<string, string>;
  identifyOn: boolean;
  galleryEmpty: boolean;
  audioFile: File;
  onRename: (from: string, to: string) => void;
  onEnrolled: () => void;
};

export function SpeakerSidebar({ result, renames, identifyOn, galleryEmpty, audioFile, onRename, onEnrolled }: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="label">Speakers</div>
      {speakersOf(result).map((sp) => (
        <SpeakerCard
          key={sp}
          speaker={sp}
          display={renames[sp] ?? sp}
          segments={result.segments}
          identification={result.identifications?.[sp] ?? null}
          identifyOn={identifyOn}
          galleryEmpty={galleryEmpty}
          audioFile={audioFile}
          onRename={(to) => onRename(sp, to)}
          onEnrolled={onEnrolled}
        />
      ))}
    </div>
  );
}
