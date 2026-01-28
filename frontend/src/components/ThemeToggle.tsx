import { useState, useRef, useEffect } from "react";
import { useTheme } from "../context/ThemeContext";
import "./ThemeToggle.css";

const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: "☀️" },
  { value: "dark", label: "Dark", icon: "🌙" },
  { value: "system", label: "System", icon: "💻" },
] as const;

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentOption = THEME_OPTIONS.find((opt) => opt.value === theme) || THEME_OPTIONS[2];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="theme-toggle" ref={dropdownRef}>
      <button
        className="theme-toggle-btn"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Toggle theme"
        aria-expanded={isOpen}
      >
        <span className="theme-icon">{currentOption.icon}</span>
        <span className="theme-label">{currentOption.label}</span>
        <span className="theme-chevron">{isOpen ? "▲" : "▼"}</span>
      </button>

      {isOpen && (
        <div className="theme-dropdown">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.value}
              className={`theme-option ${theme === option.value ? "active" : ""}`}
              onClick={() => {
                setTheme(option.value);
                setIsOpen(false);
              }}
            >
              <span className="theme-option-icon">{option.icon}</span>
              <span className="theme-option-label">{option.label}</span>
              {theme === option.value && <span className="theme-check">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
