"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

type Option = { value: string; label: string; detail?: string };

export function FormPicker({
  name,
  label,
  value,
  options,
  onChange,
}: {
  name: string;
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const selected = options.find((option) => option.value === value);
  const filtered = options.filter((option) =>
    `${option.label} ${option.detail || ""} ${option.value}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );

  function position() {
    if (!trigger.current || !panel.current) return;
    const rect = trigger.current.getBoundingClientRect();
    const viewport = window.visualViewport;
    const width = viewport?.width || innerWidth;
    const height = viewport?.height || innerHeight;
    const left = viewport?.offsetLeft || 0;
    const top = viewport?.offsetTop || 0;
    const panelWidth = Math.min(Math.max(rect.width, 300), width - 24);
    const panelHeight = Math.min(360, height - 24);
    Object.assign(panel.current.style, {
      width: `${panelWidth}px`,
      maxHeight: `${panelHeight}px`,
      left: `${Math.max(left + 12, Math.min(rect.left, left + width - panelWidth - 12))}px`,
      top: `${Math.max(top + 12, Math.min(rect.bottom + 6, top + height - panelHeight - 12))}px`,
    });
  }
  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const reposition = (event: Event) => {
      if (
        !(event.target instanceof Node) ||
        !panel.current?.contains(event.target)
      )
        position();
    };
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    window.visualViewport?.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      window.visualViewport?.removeEventListener("resize", reposition);
    };
  }, [open]);
  useEffect(() => {
    if (open)
      document
        .getElementById(`${id}-option-${active}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [active, open, id]);
  function close() {
    panel.current?.hidePopover();
    trigger.current?.focus();
  }
  function choose(option: Option) {
    onChange(option.value);
    close();
  }
  return (
    <span className="form-picker">
      <input type="hidden" name={name} value={value} />
      <button
        ref={trigger}
        type="button"
        className="form-picker-trigger"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          if (open) return close();
          setQuery("");
          setActive(
            Math.max(
              0,
              options.findIndex((option) => option.value === value),
            ),
          );
          position();
          panel.current?.showPopover();
        }}
      >
        <span>{selected?.label || "Select an option"}</span>
        {selected?.detail && (
          <span className="form-picker-code">{selected.detail}</span>
        )}
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      <div
        ref={panel}
        id={id}
        popover="auto"
        role="dialog"
        aria-label={`Choose ${label.toLowerCase()}`}
        className="form-picker-panel"
        onToggle={(event) => setOpen(event.newState === "open")}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            close();
          }
        }}
      >
        <div className="form-picker-search">
          <Search size={16} aria-hidden="true" />
          <input
            ref={search}
            role="combobox"
            aria-label={`Search ${label.toLowerCase()}`}
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={`${id}-list`}
            aria-activedescendant={
              filtered[active] ? `${id}-option-${active}` : undefined
            }
            placeholder={
              name === "countryCode"
                ? "Search country or calling code"
                : "Search options"
            }
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                setActive(
                  Math.max(
                    0,
                    Math.min(
                      filtered.length - 1,
                      active + (event.key === "ArrowDown" ? 1 : -1),
                    ),
                  ),
                );
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
          aria-label={label}
          className="form-picker-list"
        >
          {filtered.map((option, index) => (
            <button
              key={option.value}
              id={`${id}-option-${index}`}
              type="button"
              role="option"
              tabIndex={-1}
              aria-selected={value === option.value}
              data-active={index === active}
              onPointerMove={() => setActive(index)}
              onClick={() => choose(option)}
            >
              <span>{option.label}</span>
              {option.detail && (
                <span className="form-picker-code">{option.detail}</span>
              )}
              <Check
                size={16}
                aria-hidden="true"
                style={{
                  visibility: value === option.value ? "visible" : "hidden",
                }}
              />
            </button>
          ))}
          {!filtered.length && <p role="status">No matching options.</p>}
        </div>
      </div>
    </span>
  );
}
