import {
  DataQueryRequest,
  DataQueryResponse,
  DataSourceApi,
  DataSourceInstanceSettings,
  MutableDataFrame,
  FieldType,
  MetricFindValue,
} from '@grafana/data';
import { getBackendSrv, getTemplateSrv } from '@grafana/runtime';
import { lastValueFrom } from 'rxjs';

import {
  CezQuery,
  CezDataSourceOptions,
  Market,
  MarketRequest,
  PriceAndVolume,
  BestBid,
  BestAsk,
  TradesGrouped,
} from './types';

const ENDPOINTS = {
  pricesAndVolumes: '/v1.0/getPricesAndVolumesForMarket',
  bestBids: '/v1.0/getBestBidsForMarket',
  bestAsks: '/v1.0/getBestAsksForMarket',
  trades: '/v1.0/getTradesForMarketNormalized',
};

export class CezTradingDataSource extends DataSourceApi<CezQuery, CezDataSourceOptions> {
  private apiUrl: string;
  private requestCache = new Map<string, { data: any; ts: number }>();
  private inflight = new Map<string, Promise<any>>();
  private static CACHE_TTL = 30_000; // 30s

  constructor(instanceSettings: DataSourceInstanceSettings<CezDataSourceOptions>) {
    super(instanceSettings);
    this.apiUrl = instanceSettings.jsonData.apiUrl || 'https://testapi.cez.cz/dev/trading-charting-back/1.0';
  }

  private getRequestUrl(path: string): string {
    return `/api/datasources/proxy/uid/${this.uid}/api${path}`;
  }

  private buildRequest(query: CezQuery): MarketRequest {
    // deliveryDay must be YYYY-MM-DD format (not ISO datetime)
    // Never send deliveryHour to API — filtering is done client-side
    // This allows multiple panels with different hours to share cached responses
    const day = query.deliveryDay ? query.deliveryDay.substring(0, 10) : '';
    return {
      markets: [query.marketId],
      deliveryDay: day,
      useCache: query.useCache ?? true,
      cacheUpdatePriority: 1,
    };
  }

  private async post<T>(endpoint: string, body: MarketRequest): Promise<T> {
    const response = await lastValueFrom(
      getBackendSrv().fetch<T>({
        method: 'POST',
        url: this.getRequestUrl(endpoint),
        data: body,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    return response.data;
  }

  private async cachedPost<T>(endpoint: string, body: MarketRequest): Promise<T[]> {
    const key = endpoint + '|' + JSON.stringify(body);
    const now = Date.now();

    // Return from cache if fresh
    const cached = this.requestCache.get(key);
    if (cached && now - cached.ts < CezTradingDataSource.CACHE_TTL) {
      return cached.data as T[];
    }

    // Deduplicate in-flight requests
    const existing = this.inflight.get(key);
    if (existing) {
      return existing as Promise<T[]>;
    }

    const promise = this.post<T[]>(endpoint, body)
      .then((data) => {
        this.requestCache.set(key, { data, ts: Date.now() });
        this.inflight.delete(key);
        return data;
      })
      .catch((err) => {
        this.inflight.delete(key);
        console.warn(`CEZ Trading: endpoint ${endpoint} failed`, err);
        // Return stale cache if available
        const stale = this.requestCache.get(key);
        if (stale) {
          return stale.data as T[];
        }
        return [] as T[];
      });

    this.inflight.set(key, promise);
    return promise;
  }

  async metricFindQuery(query: string): Promise<MetricFindValue[]> {
    const q = (query || '').trim().toLowerCase();
    if (q === 'markets') {
      const markets = await this.getMarkets();
      return markets.map((m) => ({ text: m.name, value: String(m.id) }));
    }
    if (q === 'hours') {
      return Array.from({ length: 24 }, (_, i) => ({
        text: String(i + 1),
        value: String(i + 1),
      }));
    }
    return [];
  }

  private resolveDeliveryHour(raw: string): string {
    // Support "now", "now+1", "now+2", etc.
    const trimmed = raw.trim().toLowerCase();
    if (!trimmed.startsWith('now')) {
      return raw;
    }
    const currentHour = new Date().getHours() || 24; // 0 → 24
    let offset = 0;
    const match = trimmed.match(/^now\s*\+\s*(\d+)$/);
    if (match) {
      offset = parseInt(match[1], 10);
    }
    let hour = currentHour + offset;
    if (hour > 24) {
      hour = hour - 24;
    }
    return String(hour);
  }

  private resolveDeliveryDay(raw: string, rawHour: string): string {
    if (!raw) {
      return raw;
    }
    // If using "now+N" and the hour wraps past 24, advance the day
    const trimmedHour = rawHour.trim().toLowerCase();
    if (trimmedHour.startsWith('now')) {
      const currentHour = new Date().getHours() || 24;
      let offset = 0;
      const match = trimmedHour.match(/^now\s*\+\s*(\d+)$/);
      if (match) {
        offset = parseInt(match[1], 10);
      }
      if (currentHour + offset > 24) {
        const date = new Date(raw);
        date.setDate(date.getDate() + 1);
        return date.toISOString().substring(0, 10);
      }
    }
    return raw;
  }

  private resolveQuery(query: CezQuery): CezQuery {
    const templateSrv = getTemplateSrv();
    const marketIdStr = templateSrv.replace(String(query.marketId));
    const rawDay = templateSrv.replace(query.deliveryDay || '');
    const deliveryDay = rawDay || new Date().toISOString().substring(0, 10);
    const rawHour = templateSrv.replace(query.deliveryHour || '');
    const deliveryHour = this.resolveDeliveryHour(rawHour);
    const resolvedDay = this.resolveDeliveryDay(deliveryDay, rawHour);
    const parsedMarketId = parseInt(marketIdStr, 10);
    return {
      ...query,
      marketId: isNaN(parsedMarketId) ? query.marketId : parsedMarketId,
      deliveryDay: resolvedDay,
      deliveryHour,
    };
  }

  async query(options: DataQueryRequest<CezQuery>): Promise<DataQueryResponse> {
    const targets = options.targets.filter((t) => !t.hide);
    const allFrames: MutableDataFrame[] = [];

    for (const target of targets) {
      const resolved = this.resolveQuery(target);
      const frames = await this.runQuery(resolved);
      allFrames.push(...frames);
    }

    return { data: allFrames };
  }

  private async runQuery(query: CezQuery): Promise<MutableDataFrame[]> {
    const body = this.buildRequest(query);

    if (query.dataType === 'combined') {
      const [pv, bids, asks, trades] = await Promise.all([
        this.cachedPost<PriceAndVolume>(ENDPOINTS.pricesAndVolumes, body),
        this.cachedPost<BestBid>(ENDPOINTS.bestBids, body),
        this.cachedPost<BestAsk>(ENDPOINTS.bestAsks, body),
        this.cachedPost<TradesGrouped>(ENDPOINTS.trades, body),
      ]);

      const frames: MutableDataFrame[] = [];

      const pvFiltered = query.deliveryHour ? pv.filter((r) => String(r.deliveryHour) === query.deliveryHour) : pv;
      if (pvFiltered.length > 0) {
        frames.push(this.toPricesAndVolumesFrame(pvFiltered, query.refId + '_pv'));
      }

      const bidsFiltered = query.deliveryHour ? bids.filter((r) => String(r.deliveryHour) === query.deliveryHour) : bids;
      if (bidsFiltered.length > 0) {
        frames.push(this.toBestBidsFrame(bidsFiltered, query.refId + '_bids'));
      }

      const asksFiltered = query.deliveryHour ? asks.filter((r) => String(r.deliveryHour) === query.deliveryHour) : asks;
      if (asksFiltered.length > 0) {
        frames.push(this.toBestAsksFrame(asksFiltered, query.refId + '_asks'));
      }

      const tradesFiltered = query.deliveryHour ? trades.filter((r) => String(r.deliveryHour) === query.deliveryHour) : trades;
      if (tradesFiltered.length > 0) {
        frames.push(this.toTradesFrame(tradesFiltered, query.refId + '_trades'));
      }

      return frames;
    }

    const endpoint = ENDPOINTS[query.dataType];
    if (!endpoint) {
      throw new Error(`Unknown data type: ${query.dataType}`);
    }

    const rows = await this.cachedPost<any>(endpoint, body);
    const filtered = query.deliveryHour ? rows.filter((r: any) => String(r.deliveryHour) === query.deliveryHour) : rows;

    switch (query.dataType) {
      case 'pricesAndVolumes':
        return [this.toPricesAndVolumesFrame(filtered as PriceAndVolume[], query.refId)];
      case 'bestBids':
        return [this.toBestBidsFrame(filtered as BestBid[], query.refId)];
      case 'bestAsks':
        return [this.toBestAsksFrame(filtered as BestAsk[], query.refId)];
      case 'trades':
        return [this.toTradesFrame(filtered as TradesGrouped[], query.refId)];
      default:
        throw new Error(`Unknown data type: ${query.dataType}`);
    }
  }

  private toPricesAndVolumesFrame(rows: PriceAndVolume[], refId: string): MutableDataFrame {
    const frame = new MutableDataFrame({
      refId,
      fields: [
        { name: 'time', type: FieldType.time },
        { name: 'avgPrice', type: FieldType.number },
        { name: 'vwap', type: FieldType.number },
        { name: 'sumVolume', type: FieldType.number },
        { name: 'deliveryHour', type: FieldType.number },
      ],
    });
    for (const row of rows) {
      frame.add({
        time: new Date(row.date).getTime(),
        avgPrice: row.avgPrice,
        vwap: row.vwap,
        sumVolume: row.sumVolume,
        deliveryHour: row.deliveryHour,
      });
    }
    return frame;
  }

  private toBestBidsFrame(rows: BestBid[], refId: string): MutableDataFrame {
    const frame = new MutableDataFrame({
      refId,
      fields: [
        { name: 'time', type: FieldType.time },
        { name: 'bestBid', type: FieldType.number },
        { name: 'deliveryHour', type: FieldType.number },
      ],
    });
    for (const row of rows) {
      frame.add({
        time: new Date(row.date).getTime(),
        bestBid: row.bestBid,
        deliveryHour: row.deliveryHour,
      });
    }
    return frame;
  }

  private toBestAsksFrame(rows: BestAsk[], refId: string): MutableDataFrame {
    const frame = new MutableDataFrame({
      refId,
      fields: [
        { name: 'time', type: FieldType.time },
        { name: 'bestAsk', type: FieldType.number },
        { name: 'deliveryHour', type: FieldType.number },
      ],
    });
    for (const row of rows) {
      frame.add({
        time: new Date(row.date).getTime(),
        bestAsk: row.bestAsk,
        deliveryHour: row.deliveryHour,
      });
    }
    return frame;
  }

  private toTradesFrame(rows: TradesGrouped[], refId: string): MutableDataFrame {
    const frame = new MutableDataFrame({
      refId,
      fields: [
        { name: 'time', type: FieldType.time },
        { name: 'tradePrice', type: FieldType.number },
        { name: 'tradeVolume', type: FieldType.number },
        { name: 'label', type: FieldType.string },
        { name: 'deliveryHour', type: FieldType.number },
      ],
    });
    for (const row of rows) {
      frame.add({
        time: new Date(row.date).getTime(),
        tradePrice: row.avgPrice,
        tradeVolume: row.sumVolume,
        label: row.label || '',
        deliveryHour: row.deliveryHour,
      });
    }
    return frame;
  }

  async getMarkets(): Promise<Market[]> {
    const key = 'markets';
    const now = Date.now();
    const cached = this.requestCache.get(key);
    if (cached && now - cached.ts < 60_000) {
      return cached.data as Market[];
    }
    const response = await lastValueFrom(
      getBackendSrv().fetch<Market[]>({
        method: 'GET',
        url: this.getRequestUrl('/v1.0/markets'),
      })
    );
    this.requestCache.set(key, { data: response.data, ts: now });
    return response.data;
  }

  async testDatasource(): Promise<{ status: string; message: string }> {
    try {
      const markets = await this.getMarkets();
      return {
        status: 'success',
        message: `Connected successfully. Found ${markets.length} market(s).`,
      };
    } catch (err: any) {
      return {
        status: 'error',
        message: `Connection failed: ${err?.message || 'Unknown error'}`,
      };
    }
  }
}
