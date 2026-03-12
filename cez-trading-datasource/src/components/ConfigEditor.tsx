import React, { ChangeEvent, useEffect } from 'react';
import { InlineField, Input, SecretInput } from '@grafana/ui';
import { DataSourcePluginOptionsEditorProps } from '@grafana/data';
import { CezDataSourceOptions, CezSecureJsonData } from '../types';

const DEFAULT_API_URL = 'https://testapi.cez.cz/dev/trading-charting-back/1.0';
const DEFAULT_TOKEN_URL = 'https://testapi.cez.cz/token';

type Props = DataSourcePluginOptionsEditorProps<CezDataSourceOptions, CezSecureJsonData>;

export function ConfigEditor(props: Props) {
  const { onOptionsChange, options } = props;
  const { jsonData, secureJsonFields, secureJsonData } = options;

  useEffect(() => {
    if (!jsonData.apiUrl || !jsonData.tokenUrl) {
      onOptionsChange({
        ...options,
        jsonData: {
          ...jsonData,
          apiUrl: jsonData.apiUrl || DEFAULT_API_URL,
          tokenUrl: jsonData.tokenUrl || DEFAULT_TOKEN_URL,
        },
      });
    }
  }, []);

  const onJsonDataChange = (key: keyof CezDataSourceOptions) => (event: ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      jsonData: { ...jsonData, [key]: event.target.value },
    });
  };

  const onSecureChange = (key: keyof CezSecureJsonData) => (event: ChangeEvent<HTMLInputElement>) => {
    onOptionsChange({
      ...options,
      secureJsonData: { ...secureJsonData, [key]: event.target.value },
    });
  };

  const onSecureReset = (key: keyof CezSecureJsonData) => () => {
    onOptionsChange({
      ...options,
      secureJsonFields: { ...secureJsonFields, [key]: false },
      secureJsonData: { ...secureJsonData, [key]: '' },
    });
  };

  return (
    <>
      <InlineField label="API URL" labelWidth={20} tooltip="Base URL of the CEZ Trading charting backend">
        <Input
          width={60}
          value={jsonData.apiUrl || ''}
          onChange={onJsonDataChange('apiUrl')}
          placeholder="https://testapi.cez.cz/dev/trading-charting-back/1.0"
        />
      </InlineField>

      <InlineField label="Token URL" labelWidth={20} tooltip="WSO2 OAuth2 token endpoint">
        <Input
          width={60}
          value={jsonData.tokenUrl || ''}
          onChange={onJsonDataChange('tokenUrl')}
          placeholder="https://testapi.cez.cz/token"
        />
      </InlineField>

      <InlineField label="Consumer Key" labelWidth={20} tooltip="OAuth2 Consumer Key (Client ID)">
        <SecretInput
          width={60}
          isConfigured={secureJsonFields?.consumerKey ?? false}
          value={secureJsonData?.consumerKey || ''}
          onChange={onSecureChange('consumerKey')}
          onReset={onSecureReset('consumerKey')}
          placeholder="Enter Consumer Key"
        />
      </InlineField>

      <InlineField label="Consumer Secret" labelWidth={20} tooltip="OAuth2 Consumer Secret (Client Secret)">
        <SecretInput
          width={60}
          isConfigured={secureJsonFields?.consumerSecret ?? false}
          value={secureJsonData?.consumerSecret || ''}
          onChange={onSecureChange('consumerSecret')}
          onReset={onSecureReset('consumerSecret')}
          placeholder="Enter Consumer Secret"
        />
      </InlineField>
    </>
  );
}
