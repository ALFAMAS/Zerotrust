"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const STORAGE_KEY = "theme";
const MEDIA_QUERY = "(prefers-color-scheme: dark)";

export interface ThemeContextValue {
  theme?: string;
  setTheme: (theme: string) => void;
  resolvedTheme?: string;
  systemTheme?: "dark" | "light";
  themes: string[];
}

const ThemeContext = createContext<ThemeContextValue>({
  setTheme: () => {},
  themes: [],
});

function resolveSystemTheme(): "dark" | "light" {
  return window.matchMedia(MEDIA_QUERY).matches ? "dark" : "light";
}

function applyThemeClass(theme: string) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  const resolved = theme === "system" ? resolveSystemTheme() : theme;
  if (resolved === "light" || resolved === "dark") {
    root.classList.add(resolved);
    root.style.colorScheme = resolved;
  }
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

type ThemeProviderProps = {
  children: ReactNode;
  defaultTheme?: string;
  enableSystem?: boolean;
};

export function ThemeProvider({
  children,
  defaultTheme = "dark",
  enableSystem = true,
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState(defaultTheme);
  const [systemTheme, setSystemTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const initial = stored ?? defaultTheme;
    setThemeState(initial);
    applyThemeClass(initial);

    const media = window.matchMedia(MEDIA_QUERY);
    const onSystemChange = () => {
      const next = resolveSystemTheme();
      setSystemTheme(next);
      if ((localStorage.getItem(STORAGE_KEY) ?? defaultTheme) === "system") {
        applyThemeClass("system");
      }
    };
    setSystemTheme(resolveSystemTheme());
    media.addEventListener("change", onSystemChange);
    return () => media.removeEventListener("change", onSystemChange);
  }, [defaultTheme]);

  const setTheme = useCallback((next: string) => {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage may be unavailable in private mode
    }
    applyThemeClass(next);
  }, []);

  const themes = enableSystem ? ["light", "dark", "system"] : ["light", "dark"];
  const resolvedTheme = theme === "system" ? systemTheme : theme;

  const value = useMemo(
    () => ({ theme, setTheme, resolvedTheme, systemTheme, themes }),
    [theme, setTheme, resolvedTheme, systemTheme, themes]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
