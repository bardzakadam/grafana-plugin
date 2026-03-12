FROM grafana/grafana:latest

# Copy plugins
COPY cez-trading-datasource/dist /var/lib/grafana/plugins/cez-trading-datasource
COPY cez-trading-panel/dist /var/lib/grafana/plugins/cez-trading-panel

# Allow unsigned plugins
ENV GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=cez-trading-datasource,cez-trading-panel
ENV GF_DEFAULT_APP_MODE=development
