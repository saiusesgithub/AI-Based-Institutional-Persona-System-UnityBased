"""Convert TTS timing data into an Oculus viseme timeline.

The client drives GLB morph targets named `viseme_*` (the Oculus LipSync standard, which
Avaturn, Rocketbox and MetaPerson models all share). Providers give us timing for *text*,
so this module maps graphemes to visemes and emits a timeline the client can play against
audio position.

English spelling is not phonetic, so this is a rule-based approximation rather than true
G2P. That is a deliberate trade: it needs no extra dependencies and no pronunciation
dictionary, and because the timings themselves come from the real audio, the result reads
as correct lip motion even where the phoneme guess is imperfect.
"""

from dataclasses import dataclass

# The 15 Oculus visemes. Keep this list in sync with the frontend viseme engine.
VISEMES = [
    "sil",
    "PP",
    "FF",
    "TH",
    "DD",
    "kk",
    "CH",
    "SS",
    "nn",
    "RR",
    "aa",
    "E",
    "I",
    "O",
    "U",
]

VOWEL_VISEMES = {"aa", "E", "I", "O", "U"}

# Multi-character graphemes must be tested before single characters, longest first.
DIGRAPHS: dict[str, str] = {
    "sch": "SS",
    "tch": "CH",
    "th": "TH",
    "sh": "CH",
    "ch": "CH",
    "ph": "FF",
    "gh": "kk",
    "ck": "kk",
    "ng": "nn",
    "qu": "kk",
    "wh": "U",
    "oo": "U",
    "ou": "O",
    "ow": "O",
    "oi": "O",
    "oy": "O",
    "ee": "I",
    "ea": "I",
    "ie": "I",
    "ai": "E",
    "ay": "E",
    "au": "O",
    "aw": "O",
    "ue": "U",
    "ui": "U",
    "ew": "U",
}

SINGLES: dict[str, str] = {
    "a": "aa",
    "e": "E",
    "i": "I",
    "o": "O",
    "u": "U",
    "y": "I",
    "p": "PP",
    "b": "PP",
    "m": "PP",
    "f": "FF",
    "v": "FF",
    "t": "DD",
    "d": "DD",
    "k": "kk",
    "g": "kk",
    "c": "kk",
    "q": "kk",
    "x": "SS",
    "j": "CH",
    "s": "SS",
    "z": "SS",
    "n": "nn",
    "l": "nn",
    "r": "RR",
    "w": "U",
    "h": "aa",
}

# Below this, a viseme is too brief to register visually and just causes jitter.
MIN_VISEME_SECONDS = 0.045


@dataclass
class VisemeEvent:
    viseme: str
    start: float
    end: float

    def as_dict(self) -> dict:
        return {
            "viseme": self.viseme,
            "start": round(self.start, 4),
            "end": round(self.end, 4),
        }


@dataclass
class CharAlignment:
    """Character-level timing, as returned by ElevenLabs `with-timestamps`."""

    characters: list[str]
    starts: list[float]
    ends: list[float]


def viseme_for_span(text: str, index: int) -> tuple[str, int]:
    """Return the viseme for the grapheme at `index`, plus how many chars it consumed."""
    lowered = text.lower()
    for length in (3, 2):
        chunk = lowered[index : index + length]
        if len(chunk) == length and chunk in DIGRAPHS:
            return DIGRAPHS[chunk], length
    char = lowered[index : index + 1]
    if char in SINGLES:
        return SINGLES[char], 1
    return "sil", 1


def timeline_from_char_alignment(alignment: CharAlignment) -> list[VisemeEvent]:
    """Build a viseme timeline from exact per-character audio timings."""
    text = "".join(alignment.characters)
    events: list[VisemeEvent] = []
    index = 0
    count = min(len(alignment.characters), len(alignment.starts), len(alignment.ends))

    while index < count:
        viseme, consumed = viseme_for_span(text, index)
        last = min(index + consumed, count) - 1
        start = alignment.starts[index]
        end = alignment.ends[last]
        index += consumed
        if viseme == "sil":
            continue
        if end <= start:
            continue
        events.append(VisemeEvent(viseme=viseme, start=start, end=end))

    return _clean(events)


def timeline_from_words(words: list[tuple[str, float, float]]) -> list[VisemeEvent]:
    """Build a timeline from word-level timings by distributing graphemes across each word.

    Used for providers (Edge TTS) that report word boundaries but not character timings.
    """
    events: list[VisemeEvent] = []

    for text, start, end in words:
        duration = end - start
        if duration <= 0 or not text.strip():
            continue

        spans: list[str] = []
        index = 0
        while index < len(text):
            viseme, consumed = viseme_for_span(text, index)
            spans.append(viseme)
            index += consumed

        if not spans:
            continue

        step = duration / len(spans)
        for position, viseme in enumerate(spans):
            if viseme == "sil":
                continue
            events.append(
                VisemeEvent(
                    viseme=viseme,
                    start=start + position * step,
                    end=start + (position + 1) * step,
                )
            )

    return _clean(events)


def _clean(events: list[VisemeEvent]) -> list[VisemeEvent]:
    """Merge repeats and drop events too short to see."""
    if not events:
        return []

    events.sort(key=lambda event: event.start)

    merged: list[VisemeEvent] = [events[0]]
    for event in events[1:]:
        previous = merged[-1]
        # A repeated viseme is one held mouth shape, not two.
        if event.viseme == previous.viseme and event.start - previous.end < 0.02:
            previous.end = max(previous.end, event.end)
            continue
        if event.start < previous.end:
            event.start = previous.end
        if event.end <= event.start:
            continue
        merged.append(event)

    return [event for event in merged if event.end - event.start >= MIN_VISEME_SECONDS]


def timeline_as_dicts(events: list[VisemeEvent]) -> list[dict]:
    return [event.as_dict() for event in events]
