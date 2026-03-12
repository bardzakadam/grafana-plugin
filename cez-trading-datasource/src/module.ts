import { DataSourcePlugin } from '@grafana/data';
import { CezTradingDataSource } from './datasource';
import { ConfigEditor } from './components/ConfigEditor';
import { QueryEditor } from './components/QueryEditor';
import { CezQuery, CezDataSourceOptions } from './types';

export const plugin = new DataSourcePlugin<CezTradingDataSource, CezQuery, CezDataSourceOptions>(CezTradingDataSource)
  .setConfigEditor(ConfigEditor)
  .setQueryEditor(QueryEditor);
