"use client";

import { useAppStore } from "@/store/useAppStore";
import { stopAudio } from "@/lib/audioEngine";

type PersonaSwitcherProps = {
  onSwitch: (personaId: string) => void;
};

const initialsOf = (name: string) =>
  name
    .split(" ")
    .filter((part) => part && !part.endsWith("."))
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || name.slice(0, 2).toUpperCase();

/** Participants-style strip: big touch tiles, one per persona. */
export const PersonaSwitcher = ({ onSwitch }: PersonaSwitcherProps) => {
  const personas = useAppStore((state) => state.personas);
  const activePersonaId = useAppStore((state) => state.activePersonaId);
  const setActivePersona = useAppStore((state) => state.setActivePersona);

  if (personas.length === 0) {
    return null;
  }

  const handleSelect = (personaId: string) => {
    if (personaId === activePersonaId) {
      return;
    }
    stopAudio();
    setActivePersona(personaId);
    onSwitch(personaId);
  };

  return (
    <nav className="persona-strip" aria-label="Choose who to talk to">
      {personas.map((persona) => {
        const active = persona.id === activePersonaId;
        return (
          <button
            key={persona.id}
            type="button"
            className={`persona-tile${active ? " is-active" : ""}`}
            style={{ "--persona-accent": persona.accent_color } as React.CSSProperties}
            onClick={() => handleSelect(persona.id)}
            aria-pressed={active}
          >
            <span className="persona-tile-avatar" aria-hidden="true">
              {initialsOf(persona.display_name)}
            </span>
            <span className="persona-tile-name">{persona.display_name}</span>
          </button>
        );
      })}
    </nav>
  );
};
