# CEZ Trading Grafana Plugins

Grafana plugin monorepo for CEZ Trading energy market visualization.

## Plugins

- **cez-trading-datasource** – Data source plugin connecting to the CEZ Trading Spring Boot REST API with Bearer token auth
- **cez-trading-panel** – Panel plugin using `lightweight-charts` for intraday energy trading visualization (prices, VWAP, bid/ask, volume)

## Setup

### Prerequisites

- Node.js 18+
- Docker & Docker Compose

### Install dependencies

```bash
cd cez-trading-datasource && npm install && cd ..
cd cez-trading-panel && npm install && cd ..
```

### Build plugins (watch mode)

In two terminal tabs:

```bash
cd cez-trading-datasource && npm run dev
```

```bash
cd cez-trading-panel && npm run dev
```

### Run Grafana

```bash
docker-compose up
```

Open http://localhost:3000 (default credentials: `admin` / `admin`).

### Configure

1. Go to **Connections > Data sources > Add data source**
2. Search for **CEZ Trading**
3. Set the **API URL** (default: `https://ceztrading-apps-dev.apps.ocd.cc.corp/charting-back`)
4. Enter your **Bearer Token** (MEPAS OAuth2 token)
5. Click **Save & Test**

### Create a dashboard

1. Add a new panel
2. Select **CEZ Trading** as the data source
3. Choose a market, delivery day, and data type in the query editor
4. Switch the visualization to **CEZ Trading Chart**
5. Configure panel options (show/hide VWAP, volume, bid/ask lines)

## Production build

```bash
cd cez-trading-datasource && npm run build && cd ..
cd cez-trading-panel && npm run build && cd ..
```

The `dist/` folders contain the built plugins ready for deployment.
