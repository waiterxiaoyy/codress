import { createContext, useContext, type ReactNode } from "react";

const PageVisibilityContext = createContext(true);

export function PageVisibilityProvider({ active, children }: { active: boolean; children: ReactNode }) {
  return <PageVisibilityContext.Provider value={active}>{children}</PageVisibilityContext.Provider>;
}

export function usePageVisibility(): boolean {
  return useContext(PageVisibilityContext);
}
