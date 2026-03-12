import { PanelPlugin } from '@grafana/data';
import { TradingPanel } from './components/TradingPanel';
import { PanelOptions, defaultPanelOptions } from './types';

export const plugin = new PanelPlugin<PanelOptions>(TradingPanel).setPanelOptions((builder) => {
  builder
    .addBooleanSwitch({
      path: 'showVwap',
      name: 'Show VWAP',
      defaultValue: defaultPanelOptions.showVwap,
    })
    .addBooleanSwitch({
      path: 'showVolume',
      name: 'Show Volume',
      defaultValue: defaultPanelOptions.showVolume,
    })
    .addBooleanSwitch({
      path: 'showBidAsk',
      name: 'Show Bid/Ask',
      defaultValue: defaultPanelOptions.showBidAsk,
    })
    .addBooleanSwitch({
      path: 'showTrades',
      name: 'Show Trades',
      defaultValue: defaultPanelOptions.showTrades,
    });
});
