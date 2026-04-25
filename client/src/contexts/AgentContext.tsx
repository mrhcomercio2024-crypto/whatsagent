import { createContext, useContext, useEffect, useState } from "react";

type AgentContextValue = {
  selectedAgentId: number | null;
  setSelectedAgentId: (id: number | null) => void;
};

const AgentContext = createContext<AgentContextValue | null>(null);

const STORAGE_KEY = "whatsagent.selectedAgentId";

export function AgentProvider({ children }: { children: React.ReactNode }) {
  const [selectedAgentId, setSelected] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved ? parseInt(saved, 10) : null;
  });

  useEffect(() => {
    if (selectedAgentId == null) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, String(selectedAgentId));
    }
  }, [selectedAgentId]);

  return (
    <AgentContext.Provider value={{ selectedAgentId, setSelectedAgentId: setSelected }}>
      {children}
    </AgentContext.Provider>
  );
}

export function useAgent() {
  const ctx = useContext(AgentContext);
  if (!ctx) throw new Error("useAgent must be used inside AgentProvider");
  return ctx;
}
