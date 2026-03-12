export type DrawingTool = 'none' | 'trendline' | 'hline' | 'ray';

export interface PanelOptions {
  showVwap: boolean;
  showVolume: boolean;
  showBidAsk: boolean;
  showTrades: boolean;
}

export const defaultPanelOptions: PanelOptions = {
  showVwap: true,
  showVolume: true,
  showBidAsk: true,
  showTrades: true,
};

export interface DrawingLine {
  id: string;
  tool: DrawingTool;
  points: Array<{ time: number; price: number }>;
  color: string;
}
