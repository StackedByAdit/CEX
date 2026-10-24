import { useSyncExternalStore } from "react";
import {
  simulatorService,
  type SimulatorState,
  type Speed,
  type Aggression,
} from "./simulatorService";

export function useSimulator(): SimulatorState & {
  start: (options?: Partial<{ botCount: number; symbol: string; speed: Speed; aggression: Aggression }>) => Promise<void>;
  stop: () => void;
  setBotCount: (count: number) => void;
  setSymbol: (symbol: string) => void;
  setSpeed: (speed: Speed) => void;
  setAggression: (aggression: Aggression) => void;
  clearLogs: () => void;
} {
  const state = useSyncExternalStore(
    (cb) => simulatorService.subscribe(cb),
    () => simulatorService.getState(),
  );

  return {
    ...state,
    start: (options) => simulatorService.start(options),
    stop: () => simulatorService.stop(),
    setBotCount: (count) => simulatorService.setBotCount(count),
    setSymbol: (symbol) => simulatorService.setSymbol(symbol),
    setSpeed: (speed) => simulatorService.setSpeed(speed),
    setAggression: (aggression) => simulatorService.setAggression(aggression),
    clearLogs: () => simulatorService.clearLogs(),
  };
}
