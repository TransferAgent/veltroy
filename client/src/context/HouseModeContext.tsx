import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface HouseModeState {
  activeTenantId: string | null;
  activeTenantName: string | null;
  isHouseMode: boolean;
  enterHouse: (tenantId: string, tenantName: string) => void;
  exitHouse: () => void;
}

const HouseModeContext = createContext<HouseModeState>({
  activeTenantId: null,
  activeTenantName: null,
  isHouseMode: false,
  enterHouse: () => {},
  exitHouse: () => {},
});

export function HouseModeProvider({ children }: { children: ReactNode }) {
  const [activeTenantId, setActiveTenantId] = useState<string | null>(null);
  const [activeTenantName, setActiveTenantName] = useState<string | null>(null);

  const enterHouse = useCallback((tenantId: string, tenantName: string) => {
    setActiveTenantId(tenantId);
    setActiveTenantName(tenantName);
  }, []);

  const exitHouse = useCallback(() => {
    setActiveTenantId(null);
    setActiveTenantName(null);
  }, []);

  return (
    <HouseModeContext.Provider
      value={{
        activeTenantId,
        activeTenantName,
        isHouseMode: !!activeTenantId,
        enterHouse,
        exitHouse,
      }}
    >
      {children}
    </HouseModeContext.Provider>
  );
}

export function useHouseMode() {
  return useContext(HouseModeContext);
}
