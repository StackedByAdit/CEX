import MarketSimulator, {
  type SimulatorConfig,
  type SimulatorStats,
  type LogEntry,
} from "./marketSimulator";

export type Speed = "slow" | "normal" | "fast";
export type Aggression = "passive" | "mixed" | "aggressive";

export const SPEED_MAP: Record<Speed, number> = {
  slow: 3000,
  normal: 1500,
  fast: 500,
};

export interface SimulatorState {
  isRunning: boolean;
  botCount: number;
  symbol: string;
  speed: Speed;
  aggression: Aggression;
  stats: SimulatorStats;
  logs: LogEntry[];
}

const DEFAULT_STATS: SimulatorStats = {
  ordersPlaced: 0,
  fills: 0,
  errors: 0,
  startedAt: 0,
  tpsHistory: new Array(30).fill(0),
  activeBots: 0,
};

class SimulatorService {
  private simulator: MarketSimulator | null = null;
  private state: SimulatorState = {
    isRunning: false,
    botCount: 10,
    symbol: "SOL",
    speed: "normal",
    aggression: "mixed",
    stats: { ...DEFAULT_STATS },
    logs: [],
  };

  private listeners = new Set<() => void>();

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  getState(): SimulatorState {
    return this.state;
  }

  setBotCount(count: number): void {
    this.state = { ...this.state, botCount: count };
    this.notify();
    if (this.simulator && this.state.isRunning) {
      this.simulator.updateConfig({ botCount: count });
    }
  }

  setSymbol(symbol: string): void {
    this.state = { ...this.state, symbol };
    this.notify();
    if (this.simulator && this.state.isRunning) {
      this.simulator.updateConfig({ symbol });
    }
  }

  setSpeed(speed: Speed): void {
    this.state = { ...this.state, speed };
    this.notify();
    if (this.simulator && this.state.isRunning) {
      this.simulator.updateConfig({ intervalMs: SPEED_MAP[speed] });
    }
  }

  setAggression(aggression: Aggression): void {
    this.state = { ...this.state, aggression };
    this.notify();
    if (this.simulator && this.state.isRunning) {
      this.simulator.updateConfig({ aggression });
    }
  }

  clearLogs(): void {
    this.state = { ...this.state, logs: [] };
    this.notify();
  }

  async start(options?: Partial<{ botCount: number; symbol: string; speed: Speed; aggression: Aggression }>): Promise<void> {
    if (this.simulator) {
      this.simulator.stop();
      this.simulator = null;
    }

    if (options) {
      this.state = { ...this.state, ...options };
    }

    const config: SimulatorConfig = {
      botCount: this.state.botCount,
      symbol: this.state.symbol,
      intervalMs: SPEED_MAP[this.state.speed],
      aggression: this.state.aggression,
    };

    this.state = {
      ...this.state,
      isRunning: true,
      logs: [],
      stats: { ...DEFAULT_STATS, startedAt: Date.now() },
    };
    this.notify();

    const sim = new MarketSimulator(
      config,
      (entry: LogEntry) => {
        this.state = {
          ...this.state,
          logs: [entry, ...this.state.logs].slice(0, 300),
        };
        this.notify();
      },
      (newStats: SimulatorStats) => {
        this.state = {
          ...this.state,
          stats: { ...newStats },
        };
        this.notify();
      },
    );

    this.simulator = sim;
    await sim.start();
  }

  stop(): void {
    if (this.simulator) {
      this.simulator.stop();
      this.simulator = null;
    }
    this.state = {
      ...this.state,
      isRunning: false,
      stats: {
        ...this.state.stats,
        activeBots: 0,
      },
    };
    this.notify();
  }
}

export const simulatorService = new SimulatorService();
