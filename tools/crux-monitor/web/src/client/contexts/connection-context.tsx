import { createContext, type ReactNode, useContext, useState } from "react";

export type ConnectionStatus = "connected" | "polling" | "disconnected";

interface ConnectionContextValue {
  status: ConnectionStatus;
  setStatus: (status: ConnectionStatus) => void;
}

const ConnectionContext = createContext<ConnectionContextValue | null>(null);

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");

  return (
    <ConnectionContext.Provider value={{ status, setStatus }}>
      {children}
    </ConnectionContext.Provider>
  );
}

export function useConnection(): ConnectionContextValue {
  const context = useContext(ConnectionContext);
  if (!context) {
    throw new Error("useConnection must be used within a ConnectionProvider");
  }
  return context;
}
