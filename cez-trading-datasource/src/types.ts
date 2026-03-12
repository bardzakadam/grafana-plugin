import { DataQuery, DataSourceJsonData } from '@grafana/schema';

export type DataType = 'combined' | 'pricesAndVolumes' | 'bestBids' | 'bestAsks' | 'trades';

export interface CezQuery extends DataQuery {
  marketId: number;
  deliveryDay: string;
  deliveryHour: string;
  dataType: DataType;
  useCache: boolean;
}

export const defaultQuery: Partial<CezQuery> = {
  dataType: 'combined',
  deliveryHour: '',
  useCache: true,
};

export interface CezDataSourceOptions extends DataSourceJsonData {
  apiUrl: string;
  tokenUrl: string;
}

export interface CezSecureJsonData {
  consumerKey?: string;
  consumerSecret?: string;
}

export interface Market {
  id: number;
  name: string;
  description: string;
}

export interface MarketRequest {
  markets: number[];
  deliveryDay: string;
  deliveryHour?: string;
  useCache: boolean;
  cacheUpdatePriority?: number;
  autoRefresh?: boolean;
  defaultRange?: string;
  updateOnly?: boolean;
}

export interface PriceAndVolume {
  date: string;
  deliveryHour: number;
  deliveryTimeId: string;
  deliveryDay: string;
  avgPrice: number;
  vwap: number;
  sumVolume: number;
}

export interface BestBid {
  date: string;
  deliveryHour: number;
  deliveryTimeId: string;
  deliveryDay: string;
  bestBid: number;
}

export interface BestAsk {
  date: string;
  deliveryHour: number;
  deliveryTimeId: string;
  deliveryDay: string;
  bestAsk: number;
}

export interface Trade {
  id: number | null;
  rownum: number;
  date: string;
  deliveryHour: number;
  deliveryHalfHour: number | null;
  deliveryQuarter: number | null;
  deliveryTimeId: string;
  deliveryDay: string;
  cxPx: number;
  cxQty: number;
  cez: string;
  dateNormalized: string;
  label: string;
  weightedPrice: number;
}

export interface TradesGrouped {
  date: string;
  deliveryHour: number;
  deliveryHalfHour: number | null;
  deliveryQuarter: number | null;
  deliveryTimeId: string;
  deliveryDay: string;
  avgPrice: number;
  sumVolume: number;
  label: string;
}
