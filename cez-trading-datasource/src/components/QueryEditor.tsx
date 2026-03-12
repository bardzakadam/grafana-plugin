import React, { useEffect, useState } from 'react';
import { InlineField, Input, Select, InlineSwitch } from '@grafana/ui';
import { QueryEditorProps, SelectableValue } from '@grafana/data';
import { getTemplateSrv } from '@grafana/runtime';
import { CezTradingDataSource } from '../datasource';
import { CezDataSourceOptions, CezQuery, DataType, Market, defaultQuery } from '../types';

type Props = QueryEditorProps<CezTradingDataSource, CezQuery, CezDataSourceOptions>;

const dataTypeOptions: Array<SelectableValue<DataType>> = [
  { label: 'Combined (All)', value: 'combined' },
  { label: 'Prices & Volumes', value: 'pricesAndVolumes' },
  { label: 'Best Bids', value: 'bestBids' },
  { label: 'Best Asks', value: 'bestAsks' },
  { label: 'Trades', value: 'trades' },
];

function getVariableOptions(): Array<SelectableValue<string>> {
  try {
    const templateSrv = getTemplateSrv();
    return templateSrv.getVariables().map((v: any) => ({
      label: `$${v.name}`,
      value: `$${v.name}`,
    }));
  } catch {
    return [];
  }
}

const hourOptions: Array<SelectableValue<string>> = [
  { label: 'All Hours', value: '' },
  { label: 'Current Hour (now)', value: 'now' },
  { label: 'now+1', value: 'now+1' },
  { label: 'now+2', value: 'now+2' },
  { label: 'now+3', value: 'now+3' },
  ...Array.from({ length: 24 }, (_, i) => ({
    label: String(i + 1),
    value: String(i + 1),
  })),
];

export function QueryEditor({ datasource, query, onChange, onRunQuery }: Props) {
  const [markets, setMarkets] = useState<Array<SelectableValue<string>>>([]);

  useEffect(() => {
    datasource.getMarkets().then((list: Market[]) => {
      setMarkets(list.map((m) => ({ label: m.name, value: String(m.id), description: m.description })));
    }).catch(() => {
      setMarkets([]);
    });
  }, [datasource]);

  const q = { ...defaultQuery, ...query };

  // Market options: dashboard variables + API markets
  const varOpts = getVariableOptions();
  const marketOptions: Array<SelectableValue<string>> = [
    ...varOpts,
    ...markets,
  ];
  // Ensure current value is always in the list
  if (q.marketId != null && !marketOptions.find((o) => String(o.value) === String(q.marketId))) {
    marketOptions.push({ label: String(q.marketId), value: String(q.marketId) });
  }

  // Hour options: dashboard variables + static hours
  const hourOptionsWithVars: Array<SelectableValue<string>> = [
    ...varOpts,
    ...hourOptions,
  ];

  const marketValue = String(q.marketId ?? '');

  const onMarketChange = (option: SelectableValue<string>) => {
    const val = option.value ?? '';
    // If it's a variable like $market, store as string; otherwise as number
    if (val.startsWith('$')) {
      onChange({ ...q, marketId: val as any });
    } else {
      onChange({ ...q, marketId: Number(val) || 0 });
    }
    onRunQuery();
  };

  const onDeliveryDayChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const date = event.target.value;
    onChange({ ...q, deliveryDay: date || '' });
    onRunQuery();
  };

  const onDeliveryHourChange = (option: SelectableValue<string>) => {
    onChange({ ...q, deliveryHour: option.value ?? '' });
    onRunQuery();
  };

  const onDataTypeChange = (option: SelectableValue<DataType>) => {
    onChange({ ...q, dataType: option.value! });
    onRunQuery();
  };

  const onUseCacheChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...q, useCache: event.target.checked });
    onRunQuery();
  };

  const deliveryDayValue = q.deliveryDay ? q.deliveryDay.substring(0, 10) : '';

  return (
    <>
      <InlineField label="Market" labelWidth={16}>
        <Select
          width={30}
          options={marketOptions}
          value={marketValue}
          onChange={onMarketChange}
          placeholder="Select market"
          isClearable={false}
          allowCustomValue
        />
      </InlineField>

      <InlineField label="Delivery Day" labelWidth={16}>
        <Input
          type="date"
          width={20}
          value={deliveryDayValue}
          onChange={onDeliveryDayChange}
        />
      </InlineField>

      <InlineField label="Delivery Hour" labelWidth={16}>
        <Select
          width={15}
          options={hourOptionsWithVars}
          value={q.deliveryHour ?? ''}
          onChange={onDeliveryHourChange}
          allowCustomValue
        />
      </InlineField>

      <InlineField label="Data Type" labelWidth={16}>
        <Select
          width={30}
          options={dataTypeOptions}
          value={q.dataType}
          onChange={onDataTypeChange}
        />
      </InlineField>

      <InlineField label="Use Cache" labelWidth={16}>
        <InlineSwitch
          value={q.useCache ?? true}
          onChange={onUseCacheChange}
        />
      </InlineField>
    </>
  );
}
