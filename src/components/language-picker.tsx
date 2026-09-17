"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Languages, Search } from "lucide-react";
import { replyLanguages, type ReplyLanguage } from "@/lib/voice-language";

export function LanguagePicker({
  value,
  disabled,
  onChange,
}: {
  value: ReplyLanguage;
  disabled: boolean;
  onChange: (language: ReplyLanguage) => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const filtered = replyLanguages.filter((language) =>
    language.toLowerCase().includes(query.trim().toLowerCase()),
  );
  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const reposition = () => position();
    const scroll = (event: Event) => {
      if (
        !(event.target instanceof Node) ||
        !panel.current?.contains(event.target)
      )
        reposition();
    };
    window.addEventListener("resize", reposition);
    window.visualViewport?.addEventListener("resize", reposition);
    window.addEventListener("scroll", scroll, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.visualViewport?.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [open]);
  useEffect(() => {
    if (disabled) panel.current?.hidePopover();
  }, [disabled]);
  function close() {
    panel.current?.hidePopover();
    trigger.current?.focus();
  }
  function choose(language: ReplyLanguage) {
    close();
    onChange(language);
  }
  function position() {
    if (!trigger.current || !panel.current) return;
    const rect = trigger.current!.getBoundingClientRect();
    const viewport = window.visualViewport;
    const viewportHeight = viewport?.height || window.innerHeight;
    const viewportWidth = viewport?.width || window.innerWidth;
    const originTop = viewport?.offsetTop || 0;
    const originLeft = viewport?.offsetLeft || 0;
    const width = Math.min(320, viewportWidth - 24);
    const height = Math.min(370, viewportHeight - 24);
    const below = originTop + viewportHeight - rect.bottom - 12;
    const top = Math.max(
      originTop + 12,
      Math.min(
        originTop + viewportHeight - height - 12,
        below >= height ? rect.bottom + 8 : rect.top - height - 8,
      ),
    );
    Object.assign(panel.current!.style, {
      width: `${width}px`,
      maxHeight: `${height}px`,
      left: `${Math.max(originLeft + 12, Math.min(rect.right - width, originLeft + viewportWidth - width - 12))}px`,
      top: `${top}px`,
    });
  }
  function toggle() {
    if (open) {
      close();
      return;
    }
    position();
    setQuery("");
    setActive(replyLanguages.indexOf(value));
    panel.current!.showPopover();
  }
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="language-picker-trigger"
        aria-label="Reply language"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        disabled={disabled}
        onClick={toggle}
      >
        <Languages size={16} aria-hidden="true" />
        <span>{value}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      <div
        ref={panel}
        id={id}
        popover="auto"
        role="dialog"
        aria-label="Choose reply language"
        className="language-picker-panel"
        onToggle={(event) => setOpen(event.newState === "open")}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            close();
          }
        }}
      >
        <div className="language-picker-heading">
          <strong>Reply language</strong>
          <span>Speak any language. Mira replies in your choice.</span>
        </div>
        <div className="language-picker-search">
          <Search size={17} aria-hidden="true" />
          <input
            ref={input}
            role="combobox"
            aria-label="Search languages"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={`${id}-list`}
            aria-activedescendant={
              filtered[active] ? `${id}-option-${active}` : undefined
            }
            placeholder="Search languages..."
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                const next = Math.max(
                  0,
                  Math.min(
                    filtered.length - 1,
                    active + (event.key === "ArrowDown" ? 1 : -1),
                  ),
                );
                setActive(next);
                document
                  .getElementById(`${id}-option-${next}`)
                  ?.scrollIntoView({ block: "nearest" });
              }
              if (event.key === "Enter") {
                event.preventDefault();
                if (filtered[active]) choose(filtered[active]);
              }
            }}
          />
        </div>
        <div
          id={`${id}-list`}
          role="listbox"
          aria-label="Languages"
          className="language-picker-list"
        >
          {filtered.map((language, index) => (
            <button
              type="button"
              role="option"
              id={`${id}-option-${index}`}
              key={language}
              tabIndex={-1}
              aria-selected={language === value}
              data-active={index === active}
              onPointerMove={() => setActive(index)}
              onClick={() => choose(language)}
            >
              <span>{language}</span>
              {language === value && <Check size={17} aria-hidden="true" />}
            </button>
          ))}
          {!filtered.length && (
            <p className="language-picker-empty" role="status">
              No matching languages. Try another search.
            </p>
          )}
        </div>
        <div className="language-picker-footer" aria-live="polite">
          {filtered.length} languages{" "}
          <span>↑ ↓ to browse · Enter to select</span>
        </div>
      </div>
    </>
  );
}
