FROM grafana/grafana:latest

# Copy plugins
COPY adambardzak-ceztrading-datasource/dist /var/lib/grafana/plugins/adambardzak-ceztrading-datasource
COPY adambardzak-ceztradingchart-panel/dist /var/lib/grafana/plugins/adambardzak-ceztradingchart-panel

# Allow unsigned plugins
ENV GF_PLUGINS_ALLOW_LOADING_UNSIGNED_PLUGINS=adambardzak-ceztrading-datasource,adambardzak-ceztradingchart-panel
ENV GF_DEFAULT_APP_MODE=development
