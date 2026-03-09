"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Keyboard, type KeyboardThemeName } from "@/components/ui/keyboard";
import { cn } from "@/lib/utils";

function charToKeyCode(char: string): string | null {
  if (char === " ") return "Space";
  const lower = char.toLowerCase();
  if (lower >= "a" && lower <= "z") return `Key${lower.toUpperCase()}`;
  return null;
}

const WORD_LIST = [
  "the", "be", "to", "of", "and", "a", "in", "that", "have", "it",
  "for", "not", "on", "with", "he", "as", "you", "do", "at", "this",
  "but", "his", "by", "from", "they", "we", "say", "her", "she", "or",
  "an", "will", "my", "one", "all", "would", "there", "their", "what",
  "so", "up", "out", "if", "about", "who", "get", "which", "go", "me",
  "when", "make", "can", "like", "time", "no", "just", "him", "know",
  "take", "people", "into", "year", "your", "good", "some", "could",
  "them", "see", "other", "than", "then", "now", "look", "only", "come",
  "its", "over", "think", "also", "back", "after", "use", "two", "how",
  "our", "work", "first", "well", "way", "even", "new", "want", "because",
  "any", "these", "give", "day", "most", "us", "great", "large", "often",
  "hand", "high", "place", "hold", "turn", "water", "word", "always",
  "put", "thing", "little", "let", "where", "stop", "air", "eye",
  "open", "last", "through", "need", "should", "mountain", "find",
  "write", "move", "live", "play", "show", "grow", "form", "real",
  "feel", "help", "land", "side", "feet", "mile", "long", "near",
  "next", "tree", "city", "road", "keep", "face", "book", "light",
  "world", "still", "those", "never", "every", "three", "small", "start",
  "must", "right", "same", "tell", "does", "set", "another", "under",
  "left", "along", "might", "while", "house", "above", "down", "side",
  "been", "know", "place", "years", "live", "every", "found", "still",
  "should", "between", "stand", "own", "page", "got", "earth", "answer",
  "study", "learn", "plant", "cover", "food", "sun", "four", "between",
];

type Duration = 15 | 30 | 60;
type ColorMode = "light" | "dark" | "auto";

function generateWords(count: number): string[] {
  return Array.from({ length: count }, () =>
    WORD_LIST[Math.floor(Math.random() * WORD_LIST.length)]
  );
}

export default function TypingTest() {
  const [duration, setDuration] = useState<Duration>(60);
  const [timeLeft, setTimeLeft] = useState<number>(60);
  const [words, setWords] = useState<string[]>([]);
  const [typed, setTyped] = useState<string[]>([]);
  const [mistakes, setMistakes] = useState(0);
  const [wrongWordSet, setWrongWordSet] = useState<Set<number>>(new Set());
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [keyboardTheme, setKeyboardTheme] = useState<KeyboardThemeName>("classic");
  const [colorMode, setColorMode] = useState<ColorMode>("dark");
  const [soundEnabled, setSoundEnabled] = useState(true);

  const [lastTypedInfo, setLastTypedInfo] = useState<{ code: string; correct: boolean } | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTypedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cursorRef = useRef<HTMLSpanElement>(null);
  const textClipRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const fullText = useMemo(() => words.join(" "), [words]);
  const currentPos = typed.length;

  const activeKeyCode = useMemo(() => {
    if (!fullText || currentPos >= fullText.length) return null;
    return charToKeyCode(fullText[currentPos]);
  }, [fullText, currentPos]);

  const wordPositions = useMemo(() => {
    const positions: number[] = [];
    let pos = 0;
    for (const word of words) {
      positions.push(pos);
      pos += word.length + 1;
    }
    return positions;
  }, [words]);

  const getWordIndexAt = useCallback(
    (pos: number) => {
      for (let i = wordPositions.length - 1; i >= 0; i--) {
        if (pos >= wordPositions[i]) return i;
      }
      return 0;
    },
    [wordPositions]
  );

  const restart = useCallback(
    (newDuration?: Duration) => {
      if (timerRef.current) clearInterval(timerRef.current);
      const d = newDuration ?? duration;
    setWords(generateWords(150));
      setTyped([]);
      setMistakes(0);
      setWrongWordSet(new Set());
      setStarted(false);
      setFinished(false);
      setTimeLeft(d);
    },
    [duration]
  );

  const handleDurationChange = useCallback(
    (d: Duration) => {
      setDuration(d);
      restart(d);
    },
    [restart]
  );

  // Initialize words on client only (avoids SSR/CSR Math.random() mismatch)
  useEffect(() => {
    setWords(generateWords(150));
  }, []);

  // Keep the hidden input focused so window keydown events fire reliably
  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  // Cleanup lastTyped timeout on unmount
  useEffect(() => {
    return () => {
      if (lastTypedTimeoutRef.current) clearTimeout(lastTypedTimeoutRef.current);
    };
  }, []);

  // Timer
  useEffect(() => {
    if (!started || finished) return;
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          setFinished(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [started, finished]);

  // Scroll cursor into view by setting scrollTop on the clip container
  useEffect(() => {
    if (!cursorRef.current || !textClipRef.current) return;
    const cursorTop =
      cursorRef.current.getBoundingClientRect().top -
      textClipRef.current.getBoundingClientRect().top +
      textClipRef.current.scrollTop;
    const lineHeight = 32; // matches leading-8
    textClipRef.current.scrollTop = Math.max(0, cursorTop - lineHeight);
  }, [currentPos]);

  // Keyboard handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        e.preventDefault();
        restart();
        return;
      }
      if (finished) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Escape") return;

      if (e.key === "Backspace") {
        setTyped((prev) => prev.slice(0, -1));
        return;
      }

      if (e.key.length !== 1) return;
      if (currentPos >= fullText.length) return;

      if (!started) setStarted(true);

      const expected = fullText[currentPos];
      const isCorrect = e.key === expected;

      if (!isCorrect) {
        setMistakes((prev) => prev + 1);
        const wordIdx = getWordIndexAt(currentPos);
        setWrongWordSet((prev) => new Set([...prev, wordIdx]));
      }

      if (lastTypedTimeoutRef.current) clearTimeout(lastTypedTimeoutRef.current);
      setLastTypedInfo({ code: e.code, correct: isCorrect });
      lastTypedTimeoutRef.current = setTimeout(() => setLastTypedInfo(null), 400);

      setTyped((prev) => [...prev, e.key]);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [finished, started, currentPos, fullText, restart, getWordIndexAt]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const isDark = colorMode === "dark" || colorMode === "auto";

  // Results
  const wpm = finished
    ? Math.round((typed.length / 5) / (duration / 60))
    : null;
  const accuracy = finished
    ? Math.round(((typed.length - mistakes) / Math.max(typed.length, 1)) * 100)
    : null;

  const chars = Array.from(fullText);

  const pillBase = cn(
    "flex items-center gap-2 px-4 py-2 rounded-full text-xs tracking-widest border transition-all select-none"
  );
  const pillMuted = isDark
    ? "border-white/[0.12] text-white/40"
    : "border-black/[0.12] text-black/40";
  const pillHover = isDark
    ? "hover:border-white/30 hover:text-white/70"
    : "hover:border-black/30 hover:text-black/70";

  return (
    <div
      className={cn(
        "min-h-screen transition-colors",
        isDark ? "bg-[#191919] text-white" : "bg-[#f0efec] text-black"
      )}
      onClick={() => inputRef.current?.focus({ preventScroll: true })}
    >
      {/* Hidden input keeps focus so window keydown fires reliably */}
      <input
        ref={inputRef}
        className="sr-only"
        readOnly
        aria-hidden="true"
        tabIndex={-1}
      />
      {/* Header */}
      <header className="px-8 pt-7 pb-5">
        <p
          className={cn(
            "text-[11px] tracking-widest",
            isDark ? "text-white/35" : "text-black/35"
          )}
        >
          TYPR / BY{" "}
          <a
            href="https://typr.aswin.fyi/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            ASWINASOK
          </a>
        </p>
      </header>

      {/* Controls row */}
      <div className="px-8 flex flex-wrap gap-2.5 items-center justify-between">
        <div className="flex flex-wrap gap-2 items-center">
          {([15, 30, 60] as Duration[]).map((d, i) => (
            <button
              key={d}
              onClick={() => handleDurationChange(d)}
              className={cn(
                pillBase,
                duration === d
                  ? isDark
                    ? "border-white/50 text-white"
                    : "border-black/50 text-black"
                  : cn(pillMuted, pillHover)
              )}
            >
              <span>{d}S</span>
              <span
                className={cn(
                  "text-[10px]",
                  duration === d ? "opacity-50" : "opacity-30"
                )}
              >
                {i + 1}
              </span>
            </button>
          ))}

          <button
            onClick={() => restart()}
            className={cn(pillBase, pillMuted, pillHover)}
          >
            <span>RESTART</span>
            <span
              className={cn(
                "text-[10px]",
                isDark ? "text-white/25" : "text-black/25"
              )}
            >
              TAB
            </span>
          </button>

          <div className={cn(pillBase, pillMuted)}>
            <span>TIME</span>
            <span>{formatTime(timeLeft)}</span>
          </div>

          <div className={cn(pillBase, pillMuted)}>
            <span>MISTAKES</span>
            <span>{mistakes}</span>
          </div>
        </div>

        {/* Right: theme toggle + volume */}
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex rounded-full border text-[11px] tracking-widest overflow-hidden",
              isDark ? "border-white/[0.12]" : "border-black/[0.12]"
            )}
          >
            {(["Light", "Auto", "Dark"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setColorMode(m.toLowerCase() as ColorMode)}
                className={cn(
                  "px-3 py-2 transition-colors select-none",
                  colorMode === m.toLowerCase()
                    ? isDark
                      ? "text-white bg-white/10"
                      : "text-black bg-black/10"
                    : isDark
                    ? "text-white/35 hover:text-white/60"
                    : "text-black/35 hover:text-black/60"
                )}
              >
                {m}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSoundEnabled((v) => !v)}
              className={cn(
                "transition-colors",
                isDark
                  ? "text-white/35 hover:text-white/60"
                  : "text-black/35 hover:text-black/60"
              )}
            >
              {soundEnabled ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                </svg>
              )}
            </button>
            {/* Visual-only volume slider */}
            <div
              className={cn(
                "relative h-1 w-24 rounded-full cursor-pointer",
                isDark ? "bg-white/15" : "bg-black/15"
              )}
            >
              <div
                className={cn(
                  "h-full w-1/2 rounded-full",
                  isDark ? "bg-white/50" : "bg-black/50"
                )}
              />
              <div
                className={cn(
                  "absolute top-1/2 left-1/2 -translate-y-1/2 w-3 h-3 rounded-full -translate-x-1.5",
                  isDark ? "bg-white" : "bg-black"
                )}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Wrong count */}
      <div className="px-8 mt-3">
        <div className={cn(pillBase, pillMuted)}>
          <span>WRONG</span>
          <span>{wrongWordSet.size}</span>
        </div>
      </div>

      {/* Text area */}
      <div
        className={cn(
          "mx-8 mt-4 rounded-2xl border px-8 py-6",
          isDark ? "bg-white/[0.03] border-white/[0.08]" : "bg-black/[0.03] border-black/[0.08]"
        )}
      >
        {finished ? (
          <div className="h-[64px] flex items-center justify-center gap-8">
            <div className="text-center">
              <p className={cn("text-3xl font-bold", isDark ? "text-white" : "text-black")}>
                {wpm}
              </p>
              <p className={cn("text-[10px] tracking-widest mt-1", isDark ? "text-white/40" : "text-black/40")}>
                WPM
              </p>
            </div>
            <div className="text-center">
              <p className={cn("text-3xl font-bold", isDark ? "text-white" : "text-black")}>
                {accuracy}%
              </p>
              <p className={cn("text-[10px] tracking-widest mt-1", isDark ? "text-white/40" : "text-black/40")}>
                ACCURACY
              </p>
            </div>
            <p className={cn("text-[10px] tracking-widest", isDark ? "text-white/25" : "text-black/25")}>
              PRESS TAB TO RESTART
            </p>
          </div>
        ) : (
          // Clip container: h-[64px] = exactly 2 lines at leading-8 (32px each)
          // scrollTop is set programmatically to scroll text as user types
          <div ref={textClipRef} className="h-[64px] overflow-hidden">
            <div className="text-[15px] leading-8 tracking-wide whitespace-pre-wrap break-words">
              {chars.map((char, i) => {
                const state =
                  i < typed.length
                    ? typed[i] === char
                      ? "correct"
                      : "incorrect"
                    : i === currentPos
                    ? "cursor"
                    : "upcoming";

                return (
                  <span
                    key={i}
                    ref={state === "cursor" ? cursorRef : undefined}
                    className={cn(
                      state === "correct" &&
                        (isDark ? "text-white/80" : "text-black/80"),
                      state === "incorrect" && "text-red-400",
                      state === "cursor" &&
                        cn(
                          "cursor-blink border-l-2",
                          isDark
                            ? "text-white/25 border-white"
                            : "text-black/25 border-black"
                        ),
                      state === "upcoming" &&
                        (isDark ? "text-white/25" : "text-black/25")
                    )}
                  >
                    {char}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Keyboard section */}
      <div
        className={cn(
          "mx-8 mt-4 mb-8 rounded-2xl border p-5",
          isDark
            ? "bg-white/[0.03] border-white/[0.08]"
            : "bg-black/[0.03] border-black/[0.08]"
        )}
      >
        <div className="flex items-center justify-between mb-4">
          <p
            className={cn(
              "text-[10px] tracking-widest",
              isDark ? "text-white/25" : "text-black/25"
            )}
          >
            KEYBOARD SPONSORED BY{" "}
            <a
              href="https://keyb.himan.me/"
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "underline underline-offset-2",
                isDark ? "text-white/50" : "text-black/50"
              )}
            >
              HIMANHACKS
            </a>
          </p>
          <div className="flex gap-1">
            {(
              ["classic", "mint", "royal", "dolch", "sand", "scarlet"] as KeyboardThemeName[]
            ).map((t) => (
              <button
                key={t}
                onClick={() => setKeyboardTheme(t)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-[11px] capitalize transition-all select-none",
                  keyboardTheme === t
                    ? isDark
                      ? "bg-white/15 text-white"
                      : "bg-black/15 text-black"
                    : isDark
                    ? "text-white/30 hover:text-white/60"
                    : "text-black/30 hover:text-black/60"
                )}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-center overflow-x-auto">
          <Keyboard
            theme={keyboardTheme}
            enableSound={soundEnabled}
            enableHaptics
            activeKeyCode={activeKeyCode ?? undefined}
            lastTypedInfo={lastTypedInfo ?? undefined}
          />
        </div>
      </div>
    </div>
  );
}
