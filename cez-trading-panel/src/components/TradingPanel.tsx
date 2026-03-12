import React, { useEffect, useRef, useState, useCallback } from 'react';
import { PanelProps, FieldType, DataFrame } from '@grafana/data';
import { createChart, IChartApi, ISeriesApi, CrosshairMode, LineStyle, LineType, LineSeries, AreaSeries } from 'lightweight-charts';
import { createLineToolsPlugin, ILineToolsPlugin } from 'lightweight-charts-line-tools-core';
import { registerLinesPlugin } from 'lightweight-charts-line-tools-lines';
import { registerFibRetracementPlugin } from 'lightweight-charts-line-tools-fib-retracement';
import { registerParallelChannelPlugin } from 'lightweight-charts-line-tools-parallel-channel';
import { registerPriceRangePlugin } from 'lightweight-charts-line-tools-price-range';
import { LineToolRectangle } from 'lightweight-charts-line-tools-rectangle';
import { PanelOptions } from '../types';

interface Props extends PanelProps<PanelOptions> {}

function getFieldValues(series: DataFrame[], fieldName: string): { time: number[]; values: number[] } | null {
  for (const frame of series) {
    const timeField = frame.fields.find((f) => f.type === FieldType.time);
    const valueField = frame.fields.find((f) => f.name === fieldName);
    if (timeField && valueField) {
      return {
        time: timeField.values.toArray ? timeField.values.toArray() : Array.from(timeField.values),
        values: valueField.values.toArray ? valueField.values.toArray() : Array.from(valueField.values),
      };
    }
  }
  return null;
}

function getTradeData(series: DataFrame[]) {
  for (const frame of series) {
    const timeField = frame.fields.find((f) => f.type === FieldType.time);
    const priceField = frame.fields.find((f) => f.name === 'tradePrice');
    const labelField = frame.fields.find((f) => f.name === 'label');
    if (timeField && priceField) {
      const toArr = (f: any) => (f.values.toArray ? f.values.toArray() : Array.from(f.values));
      return { time: toArr(timeField), price: toArr(priceField), label: labelField ? toArr(labelField) : [] };
    }
  }
  return null;
}

function toLineData(timeMs: number[], values: number[]) {
  const data: Array<{ time: number; value: number }> = [];
  for (let i = 0; i < timeMs.length; i++) {
    if (values[i] != null && !isNaN(values[i])) {
      data.push({ time: Math.floor(timeMs[i] / 1000), value: values[i] });
    }
  }
  data.sort((a, b) => a.time - b.time);
  const deduped: typeof data = [];
  for (const d of data) {
    if (deduped.length === 0 || deduped[deduped.length - 1].time !== d.time) {
      deduped.push(d);
    }
  }
  return deduped;
}

function toCumulativeData(timeMs: number[], values: number[]) {
  const sorted = toLineData(timeMs, values);
  let cumSum = 0;
  return sorted.map((d) => {
    cumSum += d.value;
    return { time: d.time, value: cumSum };
  });
}

function toTradePoints(tradeData: { time: number[]; price: number[] }) {
  const pts: Array<{ time: number; value: number }> = [];
  for (let i = 0; i < tradeData.time.length; i++) {
    const t = Math.floor(tradeData.time[i] / 1000);
    const price = tradeData.price[i];
    if (price == null || isNaN(price)) { continue; }
    pts.push({ time: t, value: price });
  }
  pts.sort((a, b) => a.time - b.time);
  const deduped: typeof pts = [];
  for (const p of pts) {
    if (deduped.length === 0 || deduped[deduped.length - 1].time !== p.time) { deduped.push(p); }
  }
  return deduped;
}

const TOOLBAR_HEIGHT = 36;

const RANGES = [
  { label: '10m', seconds: 10 * 60 },
  { label: '30m', seconds: 30 * 60 },
  { label: '1H', seconds: 60 * 60 },
  { label: '3H', seconds: 3 * 60 * 60 },
  { label: '6H', seconds: 6 * 60 * 60 },
  { label: '1D', seconds: 24 * 60 * 60 },
  { label: 'All', seconds: 0 },
];

const TOOLS = [
  { type: null, label: '↖' },
  { type: 'TrendLine', label: '╲' },
  { type: 'Ray', label: '⟋' },
  { type: 'ExtendedLine', label: '↔' },
  { type: 'HorizontalLine', label: '─' },
  { type: 'HorizontalRay', label: '→' },
  { type: 'ParallelChannel', label: '▭' },
  { type: 'FibRetracement', label: '⊟' },
  { type: 'Rectangle', label: '□' },
  { type: 'PriceRange', label: '⇕' },
  { type: 'Arrow', label: '➝' },
];

interface TooltipData {
  visible: boolean;
  x: number;
  y: number;
  time: string;
  values: Array<{ label: string; value: string; color: string }>;
}

const TOOLTIP_EMPTY: TooltipData = { visible: false, x: 0, y: 0, time: '', values: [] };

function formatTime(utcSec: number): string {
  const d = new Date(utcSec * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

interface SeriesRefs {
  volume: ISeriesApi<'Area'>;
  bid: ISeriesApi<'Line'>;
  ask: ISeriesApi<'Line'>;
  anchor: ISeriesApi<'Line'>;
  vwap: ISeriesApi<'Line'>;
  trades: ISeriesApi<'Line'>;
}

interface Visibility {
  volume: boolean;
  bidAsk: boolean;
  vwap: boolean;
  trades: boolean;
}

const LAYER_TOGGLES: Array<{ key: keyof Visibility; label: string; color: string }> = [
  { key: 'volume', label: 'Vol', color: 'rgba(210, 160, 60, 0.8)' },
  { key: 'bidAsk', label: 'Bid/Ask', color: '#2196f3' },
  { key: 'vwap', label: 'VWAP', color: '#f5a623' },
  { key: 'trades', label: 'Trades', color: '#4caf50' },
];

export function TradingPanel({ data, width, height, options }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const lineToolsRef = useRef<ILineToolsPlugin | null>(null);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [activeRange, setActiveRange] = useState<string>('All');
  const [tooltip, setTooltip] = useState<TooltipData>(TOOLTIP_EMPTY);
  const [visibility, setVisibility] = useState<Visibility>({
    volume: options.showVolume,
    bidAsk: options.showBidAsk,
    vwap: options.showVwap,
    trades: options.showTrades,
  });
  const seriesRefsRef = useRef<SeriesRefs | null>(null);
  const seriesMapRef = useRef<Map<ISeriesApi<any>, { label: string; color: string }>>(new Map());
  const isFirstDataRef = useRef(true);

  const chartHeight = height - TOOLBAR_HEIGHT;

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveTool(null);
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (lineToolsRef.current) {
          lineToolsRef.current.removeSelectedLineTools();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Chart creation
  useEffect(() => {
    if (!chartContainerRef.current) {
      return;
    }

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
      seriesRefsRef.current = null;
      lineToolsRef.current = null;
    }
    isFirstDataRef.current = true;

    const chart = createChart(chartContainerRef.current, {
      width,
      height: chartHeight,
      layout: { background: { color: '#161616' }, textColor: '#cccccc' },
      grid: { vertLines: { color: '#2a2a2a' }, horzLines: { color: '#2a2a2a' } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { visible: true, borderColor: '#2a2a2a' },
      leftPriceScale: { visible: true, borderColor: '#2a2a2a' },
      timeScale: { borderColor: '#2a2a2a', timeVisible: true, secondsVisible: false },
    });
    chartRef.current = chart;

    const sMap = new Map<ISeriesApi<any>, { label: string; color: string }>();
    const refs = {} as SeriesRefs;

    refs.volume = chart.addSeries(AreaSeries, {
      topColor: 'rgba(210, 160, 60, 0.4)',
      bottomColor: 'rgba(210, 160, 60, 0.05)',
      lineColor: 'rgba(210, 160, 60, 0.8)',
      lineWidth: 1,
      title: 'Volume',
      priceScaleId: 'right',
      lineType: LineType.WithSteps,
      visible: options.showVolume,
    });
    sMap.set(refs.volume, { label: 'Volume', color: 'rgba(210, 160, 60, 0.8)' });

    refs.bid = chart.addSeries(LineSeries, {
      color: '#2196f3', lineWidth: 1, title: 'Best Bid',
      priceScaleId: 'left', lineType: LineType.WithSteps,
      visible: options.showBidAsk,
    });
    sMap.set(refs.bid, { label: 'Best Bid', color: '#2196f3' });

    refs.ask = chart.addSeries(LineSeries, {
      color: '#f44336', lineWidth: 1, title: 'Best Ask',
      priceScaleId: 'left', lineType: LineType.WithSteps,
      visible: options.showBidAsk,
    });
    sMap.set(refs.ask, { label: 'Best Ask', color: '#f44336' });

    // Hidden anchor series for line tools plugin (needs a LineSeries)
    refs.anchor = chart.addSeries(LineSeries, {
      color: 'transparent', lineWidth: 0, priceScaleId: 'left',
      lastValueVisible: false, priceLineVisible: false,
      crosshairMarkerVisible: false,
    });

    refs.vwap = chart.addSeries(LineSeries, {
      color: '#f5a623', lineWidth: 1, lineStyle: LineStyle.Dashed,
      title: 'VWAP', priceScaleId: 'left',
      visible: options.showVwap,
    });
    sMap.set(refs.vwap, { label: 'VWAP', color: '#f5a623' });

    refs.trades = chart.addSeries(LineSeries, {
      color: '#4caf50',
      lineVisible: false,
      pointMarkersVisible: true,
      pointMarkersRadius: 4,
      priceScaleId: 'left',
      lastValueVisible: false,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
      visible: options.showTrades,
    });
    sMap.set(refs.trades, { label: 'Trade', color: '#4caf50' });

    seriesRefsRef.current = refs;
    seriesMapRef.current = sMap;

    // Tooltip
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.point || param.point.x < 0 || param.point.y < 0) {
        setTooltip(TOOLTIP_EMPTY);
        return;
      }
      const values: Array<{ label: string; value: string; color: string }> = [];
      for (const [series, meta] of sMap) {
        const seriesData = param.seriesData.get(series) as any;
        if (seriesData) {
          const val = seriesData.value ?? seriesData.close;
          if (val != null && !isNaN(val)) {
            values.push({ label: meta.label, value: val.toFixed(2), color: meta.color });
          }
        }
      }
      if (values.length === 0) {
        setTooltip(TOOLTIP_EMPTY);
        return;
      }
      setTooltip({
        visible: true,
        x: param.point.x,
        y: param.point.y,
        time: formatTime(param.time as number),
        values,
      });
    });

    // Hide tooltip when mouse leaves chart
    chartContainerRef.current.addEventListener('mouseleave', () => {
      setTooltip(TOOLTIP_EMPTY);
    });

    // Line tools plugin — attached to hidden anchor series
    const lineTools = createLineToolsPlugin(chart, refs.anchor);
    registerLinesPlugin(lineTools);
    registerFibRetracementPlugin(lineTools);
    registerParallelChannelPlugin(lineTools);
    registerPriceRangePlugin(lineTools);
    lineTools.registerLineTool('Rectangle', LineToolRectangle);
    lineToolsRef.current = lineTools;

    return () => {
      lineToolsRef.current = null;
      chartRef.current?.remove();
      chartRef.current = null;
      seriesRefsRef.current = null;
    };
  }, []);

  // Resize
  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.resize(width, chartHeight);
    }
  }, [width, chartHeight]);

  // Data update
  useEffect(() => {
    const refs = seriesRefsRef.current;
    if (!refs || !chartRef.current) {
      return;
    }

    if (!data.series || data.series.length === 0) {
      return;
    }

    const volumeData = getFieldValues(data.series, 'sumVolume');
    refs.volume.setData(volumeData ? toCumulativeData(volumeData.time, volumeData.values) : []);

    const bidData = getFieldValues(data.series, 'bestBid');
    refs.bid.setData(bidData ? toLineData(bidData.time, bidData.values) : []);

    const askData = getFieldValues(data.series, 'bestAsk');
    refs.ask.setData(askData ? toLineData(askData.time, askData.values) : []);

    // Feed anchor series with bid data so line tools have a price reference
    if (bidData) {
      refs.anchor.setData(toLineData(bidData.time, bidData.values));
    }

    const vwapData = getFieldValues(data.series, 'vwap');
    refs.vwap.setData(vwapData ? toLineData(vwapData.time, vwapData.values) : []);

    const tradeData = getTradeData(data.series);
    refs.trades.setData(tradeData && tradeData.time.length > 0 ? toTradePoints(tradeData) : []);

    if (isFirstDataRef.current) {
      chartRef.current.timeScale().fitContent();
      isFirstDataRef.current = false;
    }
  }, [data]);

  // Apply visibility changes
  useEffect(() => {
    const refs = seriesRefsRef.current;
    if (!refs) { return; }
    refs.volume.applyOptions({ visible: visibility.volume });
    refs.bid.applyOptions({ visible: visibility.bidAsk });
    refs.ask.applyOptions({ visible: visibility.bidAsk });
    refs.vwap.applyOptions({ visible: visibility.vwap });
    refs.trades.applyOptions({ visible: visibility.trades });
  }, [visibility]);

  const toggleVisibility = useCallback((key: keyof Visibility) => {
    setVisibility((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const selectTool = useCallback((toolType: string | null) => {
    setActiveTool(toolType);
    if (toolType && lineToolsRef.current) {
      lineToolsRef.current.addLineTool(toolType, []);
    }
  }, []);

  const clearDrawings = useCallback(() => {
    if (lineToolsRef.current) {
      lineToolsRef.current.removeAllLineTools();
    }
  }, []);

  const deleteSelected = useCallback(() => {
    if (lineToolsRef.current) {
      lineToolsRef.current.removeSelectedLineTools();
    }
  }, []);

  const setRange = useCallback((label: string, seconds: number) => {
    setActiveRange(label);
    const chart = chartRef.current;
    const refs = seriesRefsRef.current;
    if (!chart || !refs) { return; }

    if (seconds === 0) {
      chart.timeScale().fitContent();
      return;
    }

    const mainData = refs.bid.data();
    if (!mainData || mainData.length === 0) {
      chart.timeScale().fitContent();
      return;
    }
    const lastPoint = mainData[mainData.length - 1] as { time: number };
    const to = lastPoint.time;
    const from = to - seconds;

    chart.timeScale().setVisibleRange({
      from: from as any,
      to: to as any,
    });
  }, []);

  const btnStyle = (active: boolean): React.CSSProperties => ({
    padding: '4px 8px',
    fontSize: 11,
    cursor: 'pointer',
    background: active ? '#444' : '#2a2a2a',
    color: active ? '#fff' : '#aaa',
    border: active ? '1px solid #666' : '1px solid #333',
    borderRadius: 3,
    whiteSpace: 'nowrap',
  });

  const toggleStyle = (on: boolean, color: string): React.CSSProperties => ({
    padding: '4px 8px',
    fontSize: 11,
    cursor: 'pointer',
    background: on ? '#2a2a2a' : '#1a1a1a',
    color: on ? color : '#555',
    border: on ? `1px solid ${color}44` : '1px solid #333',
    borderRadius: 3,
    whiteSpace: 'nowrap',
    opacity: on ? 1 : 0.5,
  });

  return (
    <div ref={wrapperRef} style={{ width, height, background: '#161616' }}>
      {/* Toolbar */}
      <div style={{
        height: TOOLBAR_HEIGHT, display: 'flex', alignItems: 'center',
        padding: '0 6px', borderBottom: '1px solid #2a2a2a', gap: 3, overflowX: 'auto',
      }}>
        {TOOLS.map((t) => (
          <button
            key={t.type ?? 'sel'}
            style={btnStyle(activeTool === t.type)}
            onClick={() => selectTool(t.type)}
            title={t.type || 'Select'}
          >
            {t.label}
          </button>
        ))}
        <button style={{ ...btnStyle(false), fontSize: 10 }} onClick={deleteSelected} title="Delete selected">Del</button>
        <button style={{ ...btnStyle(false), color: '#f44336', fontSize: 10 }} onClick={clearDrawings} title="Clear all drawings">Clr</button>
        <div style={{ width: 1, height: 20, background: '#444', margin: '0 4px' }} />
        {RANGES.map((r) => (
          <button
            key={r.label}
            style={btnStyle(activeRange === r.label)}
            onClick={() => setRange(r.label, r.seconds)}
          >
            {r.label}
          </button>
        ))}
        <div style={{ width: 1, height: 20, background: '#444', margin: '0 4px' }} />
        {LAYER_TOGGLES.map((t) => (
          <button
            key={t.key}
            style={toggleStyle(visibility[t.key], t.color)}
            onClick={() => toggleVisibility(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div
        ref={chartContainerRef}
        style={{ width, height: chartHeight, cursor: activeTool ? 'crosshair' : 'default', position: 'relative' }}
      >
        {tooltip.visible && (
          <div style={{
            position: 'absolute',
            left: tooltip.x + 16,
            top: tooltip.y - 10,
            background: 'rgba(22, 22, 22, 0.92)',
            border: '1px solid #444',
            borderRadius: 4,
            padding: '6px 10px',
            pointerEvents: 'none',
            zIndex: 10,
            fontSize: 11,
            lineHeight: '16px',
            color: '#ccc',
            whiteSpace: 'nowrap',
            maxWidth: width - tooltip.x - 30,
          }}>
            <div style={{ color: '#999', marginBottom: 3 }}>{tooltip.time}</div>
            {tooltip.values.map((v) => (
              <div key={v.label} style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
                <span style={{ color: v.color }}>{v.label}</span>
                <span style={{ fontWeight: 600 }}>{v.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
