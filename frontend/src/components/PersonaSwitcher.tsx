"use client";

import { useAppStore } from "@/store/useAppStore";
import { stopAudio } from "@/lib/audioEngine";

type PersonaSwitcherProps = {
  onSwitch: (personaId: string) => void;
};

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
    // Cut off the outgoing persona mid-sentence; they are no longer on screen.
    stopAudio();
    setActivePersona(personaId);
    onSwitch(personaId);
  };

  return (
    <div className="persona-switcher" role="tablist" aria-label="Choose a persona">
      {personas.map((persona) => {
        const active = persona.id === activePersonaId;
        return (
          <button
            key={persona.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={`persona-chip${active ? " is-active" : ""}`}
            style={{ "--persona-accent": persona.accent_color } as React.CSSProperties}
            onClick={() => handleSelect(persona.id)}
          >
            <span className="persona-chip-dot" aria-hidden="true" />
            <span className="persona-chip-text">
              <span className="persona-chip-name">{persona.display_name}</span>
              <span className="persona-chip-role">{persona.role}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
};
