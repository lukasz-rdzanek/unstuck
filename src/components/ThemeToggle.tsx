import { cn } from "@/lib/utils";

type Theme = "light" | "dark";

// localStorage is mirrored alongside the cookie purely as a courtesy for other
// client code; the cookie is the source of truth read by middleware. Safari
// private mode throws on write, so guard it (same pattern as LessonAside).
function persist(theme: Theme): void {
  try {
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `theme=${theme}; path=/; max-age=31536000; SameSite=Lax${secure}`;
  } catch {
    /* ignore */
  }
  try {
    window.localStorage.setItem("theme", theme);
  } catch {
    /* quota / private mode — ignore */
  }
}

interface Props {
  /** Standalone fixed-corner control (for pages without a topbar). */
  floating?: boolean;
  className?: string;
}

/**
 * Sun/moon theme toggle. The icon is driven entirely by the `.dark` class on
 * <html> via CSS (see .theme-toggle__sun / __moon in global.css), so the island
 * holds no React state — that sidesteps any SSR/hydration mismatch and renders
 * the correct icon the instant the inline head script sets the class. Clicking
 * flips the root class, persists the choice, and plays a brief cross-fade.
 */
export default function ThemeToggle({ floating = false, className }: Props) {
  function toggle() {
    const root = document.documentElement;
    const next: Theme = root.classList.contains("dark") ? "light" : "dark";
    root.classList.add("theme-anim");
    root.classList.toggle("dark", next === "dark");
    persist(next);
    window.setTimeout(() => {
      root.classList.remove("theme-anim");
    }, 300);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle color theme"
      title="Toggle color theme"
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
        floating
          ? "bg-glass border-glass fixed top-4 right-4 z-50 border backdrop-blur-xl"
          : "text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      {/* Sun — shown in dark mode (action: switch to light) */}
      <svg
        className="theme-toggle__sun"
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="4"></circle>
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"></path>
      </svg>
      {/* Moon — shown in light mode (action: switch to dark) */}
      <svg
        className="theme-toggle__moon"
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
      </svg>
    </button>
  );
}
