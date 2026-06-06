import { createContext, useContext, useEffect } from "react";

type ThemeMode = "light" | "dark";

// PISA is a dark-only console. The toggle is retired, but the context is
// kept (always reporting "dark") so existing consumers — AppLayout's
// icons, the Dashboard donut's `data-theme` CSS hooks — keep working and
// a light variant could be reintroduced later without touching them.
const ThemeContext = createContext<{
  mode: ThemeMode;
  toggle: () => void;
}>({ mode: "dark", toggle: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "dark");
    // Drop any persisted preference from the toggle era.
    localStorage.removeItem("pisa-theme");
  }, []);

  return (
    <ThemeContext.Provider value={{ mode: "dark", toggle: () => {} }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
