// ====================================================================
// SUMMARY CARD — Reactive summary tile for lights/covers/security/batteries (LitElement)
// ====================================================================

import { LitElement, html, css, type PropertyValues } from 'lit';
import type { HomeAssistant, HassEntity } from '../types/homeassistant';
import { Registry } from '../Registry';
import { trackHassUpdate, debugLog, timeStart, timeEnd } from '../utils/debug';
import { localize } from '../utils/localize';
import {
  getBatteryEntities,
  getAirQualityEntities,
  getAirQualityEntityInfo,
  SECURITY_EXCLUDED_PLATFORMS,
  type AirQualityMetric,
  type AirQualityStatus,
} from '../utils/entity-filter';

declare global {
  interface Window {
    customCards?: Array<{ type: string; name: string; description: string }>;
  }
}

type SummaryType = 'lights' | 'covers' | 'security' | 'batteries' | 'valves' | 'climate' | 'cameras' | 'air_quality';

interface SummaryCardConfig {
  summary_type: SummaryType;
  hide_mobile_app_batteries?: boolean;
  show_unknown_battery_group?: boolean;
  battery_critical_threshold?: number;
  air_quality_co2_warning_threshold?: number;
  air_quality_co2_critical_threshold?: number;
  air_quality_humidity_warning_min?: number;
  air_quality_humidity_warning_max?: number;
  air_quality_humidity_critical_min?: number;
  air_quality_humidity_critical_max?: number;
  air_quality_temperature_warning_min?: number;
  air_quality_temperature_warning_max?: number;
  air_quality_temperature_critical_min?: number;
  air_quality_temperature_critical_max?: number;
}

type AirQualitySummaryStatus = AirQualityStatus;
type BatterySummaryStatus = 'critical' | 'unknown' | 'good';

interface DisplayConfig {
  icon: string;
  name: string;
  color: string;
  path: string;
}

const COVER_DEVICE_CLASSES = new Set(['awning', 'blind', 'curtain', 'shade', 'shutter', 'window']);

const SECURITY_COVER_CLASSES = new Set(['door', 'garage', 'gate', 'window']);
const SECURITY_BINARY_SENSOR_CLASSES = new Set(['door', 'window', 'garage_door', 'opening', 'smoke', 'gas', 'heat']);

const COLOR_MAP: Record<string, string> = {
  orange: 'var(--orange-color, #ff9800)',
  purple: 'var(--purple-color, #9c27b0)',
  yellow: 'var(--yellow-color, #ffc107)',
  red: 'var(--red-color, #f44336)',
  blue: 'var(--blue-color, #03a9f4)',
  grey: 'var(--disabled-color, #bdbdbd)',
};

class Simon42SummaryCard extends LitElement {
  static properties = {
    hass: { attribute: false },
    _count: { state: true },
  };

  public hass?: HomeAssistant;
  private _count = 0;
  private _config!: SummaryCardConfig;
  private _relevantEntityIds: Set<string> | null = null;

  static styles = css`
    :host {
      display: block;
      cursor: pointer;
    }
    ha-card {
      padding: 12px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      gap: 8px;
      height: 100%;
      box-sizing: border-box;
      --ha-card-border-width: 0;
      background: var(--ha-card-background, var(--card-background-color, #fff));
      border-radius: var(--ha-card-border-radius, 12px);
    }
    ha-card:active {
      transform: scale(0.97);
      transition: transform 0.1s;
    }
    .icon {
      --mdc-icon-size: 28px;
      transition: color 0.3s;
    }
    .name {
      font-size: 13px;
      font-weight: 500;
      line-height: 1.2;
      color: var(--primary-text-color);
    }
    .air-quality-rows {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-top: 2px;
    }
    .air-quality-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
      line-height: 1.3;
      gap: 6px;
    }
    .air-quality-label {
      color: var(--secondary-text-color);
    }
    .air-quality-status {
      font-weight: 600;
    }
  `;

  setConfig(config: SummaryCardConfig): void {
    this._config = config;
    this._relevantEntityIds = null;
  }

  protected willUpdate(changedProps: PropertyValues): void {
    if (!changedProps.has('hass') || !this.hass) return;

    trackHassUpdate(`summary-${this._config.summary_type}`);
    const oldHass = changedProps.get('hass') as HomeAssistant | undefined;

    if (!oldHass || oldHass.entities !== this.hass.entities) {
      this._relevantEntityIds = null;
      debugLog(`summary-${this._config.summary_type}: cache invalidated (registry changed)`);
    }

    const newCount = this._calculateCount();
    if (this._count !== newCount) {
      this._count = newCount;
    }
  }

  private _isEntityRelevant(id: string, _state: HassEntity): boolean {
    return !Registry.isEntityExcludedWithStateCategory(id);
  }

  private _getRelevantEntities(): void {
    if (!this.hass || this._relevantEntityIds) return;
    if (!Registry.initialized) return;

    const type = this._config.summary_type;
    timeStart(`summary-getRelevant-${type}`);
    const hass = this.hass;
    let result: string[];

    switch (this._config.summary_type) {
      case 'lights':
        result = Registry.getVisibleEntityIdsForDomain('light').filter(
          (id) => hass.states[id] && this._isEntityRelevant(id, hass.states[id])
        );
        break;

      case 'covers':
        result = Registry.getVisibleEntityIdsForDomain('cover').filter((id) => {
          const state = hass.states[id];
          if (!state) return false;
          if (!this._isEntityRelevant(id, state)) return false;
          const coverDeviceClass = state.attributes?.device_class;
          if (coverDeviceClass && !COVER_DEVICE_CLASSES.has(coverDeviceClass)) return false;
          return true;
        });
        break;

      case 'security': {
        const lockIds = Registry.getVisibleEntityIdsForDomain('lock');
        const coverIds = Registry.getVisibleEntityIdsForDomain('cover');
        const binarySensorIds = Registry.getVisibleEntityIdsForDomain('binary_sensor');

        result = [];
        for (const id of lockIds) {
          if (hass.states[id] && this._isEntityRelevant(id, hass.states[id])) {
            result.push(id);
          }
        }
        for (const id of coverIds) {
          const state = hass.states[id];
          if (!state || !this._isEntityRelevant(id, state)) continue;
          const deviceClass = state.attributes?.device_class;
          if (deviceClass !== undefined && SECURITY_COVER_CLASSES.has(deviceClass)) {
            result.push(id);
          }
        }
        for (const id of binarySensorIds) {
          const state = hass.states[id];
          if (!state || !this._isEntityRelevant(id, state)) continue;
          const entry = Registry.getEntity(id);
          if (entry?.platform && SECURITY_EXCLUDED_PLATFORMS.has(entry.platform)) continue;
          const deviceClass = state.attributes?.device_class;
          if (deviceClass !== undefined && SECURITY_BINARY_SENSOR_CLASSES.has(deviceClass)) {
            result.push(id);
          }
        }
        break;
      }

      case 'batteries': {
        result = getBatteryEntities(hass, this._config);
        break;
      }

      case 'climate':
        result = Registry.getVisibleEntityIdsForDomain('climate').filter(
          (id) => hass.states[id] && this._isEntityRelevant(id, hass.states[id])
        );
        break;

      case 'cameras':
        result = Registry.getVisibleEntityIdsForDomain('camera').filter(
          (id) => hass.states[id] && this._isEntityRelevant(id, hass.states[id])
        );
        break;

      case 'air_quality':
        result = getAirQualityEntities(hass, this._config).map((item) => item.entityId);
        break;

      case 'climate':
        result = [
          ...Registry.getVisibleEntityIdsForDomain('climate'),
          ...Registry.getVisibleEntityIdsForDomain('humidifier'),
        ].filter((id) => hass.states[id] && this._isEntityRelevant(id, hass.states[id]));
        break;

      default:
        result = [];
    }

    this._relevantEntityIds = new Set(result);
    debugLog(`summary-${type}: ${result.length} relevant entities`);
    timeEnd(`summary-getRelevant-${type}`);
  }

  private _calculateCount(): number {
    if (!this.hass) return 0;

    this._getRelevantEntities();
    if (!this._relevantEntityIds || this._relevantEntityIds.size === 0) return 0;

    const hass = this.hass;
    let count = 0;

    switch (this._config.summary_type) {
      case 'lights':
        for (const id of this._relevantEntityIds) {
          if (hass.states[id]?.state === 'on') count++;
        }
        return count;

      case 'covers':
        for (const id of this._relevantEntityIds) {
          const s = hass.states[id]?.state;
          if (s === 'open' || s === 'opening') count++;
        }
        return count;

      case 'security':
        for (const id of this._relevantEntityIds) {
          const state = hass.states[id];
          if (!state) continue;
          if (id.startsWith('lock.') && state.state === 'unlocked') count++;
          else if (id.startsWith('cover.') && state.state === 'open') count++;
          else if (id.startsWith('binary_sensor.') && state.state === 'on') count++;
        }
        return count;

      case 'batteries': {
        const critThreshold = this._config.battery_critical_threshold ?? 20;
        for (const id of this._relevantEntityIds) {
          const state = hass.states[id];
          if (!state) continue;
          if (id.startsWith('binary_sensor.')) {
            if (state.state === 'on') count++;
          } else {
            const unit = state.attributes?.unit_of_measurement;
            if (unit && unit !== '%') continue;
            const value = parseFloat(state.state);
            const isUnavailable = state.state === 'unavailable' || state.state === 'unknown';
            if (isUnavailable || (!isNaN(value) && value < critThreshold)) count++;
          }
        }
        return count;
      }

      case 'climate':
        for (const id of this._relevantEntityIds) {
          const s = hass.states[id]?.state;
          if (s && s !== 'off' && s !== 'unavailable' && s !== 'unknown') count++;
        }
        return count;

      case 'cameras':
        return this._relevantEntityIds.size;

      case 'air_quality': {
        const status = this._getAirQualitySummaryStatus();
        if (status === 'ok') return 0;

        for (const id of this._relevantEntityIds) {
          const info = getAirQualityEntityInfo(id, hass, this._config);
          if (info?.status === status) count++;
        }

        return count;
      }

      default:
        return 0;
    }
  }

  private _getDisplayConfig(): DisplayConfig {
    const count = this._count;
    const hasItems = count > 0;
    const airQualitySummaryStatus = this._getAirQualitySummaryStatus();

    const configs: Record<SummaryType, DisplayConfig> = {
      lights: {
        icon: 'mdi:lamps',
        name: hasItems
          ? `${count} ${count === 1 ? localize('summary.lights_on_one') : localize('summary.lights_on_many')}`
          : localize('summary.lights_off'),
        color: hasItems ? 'orange' : 'grey',
        path: 'lights',
      },
      covers: {
        icon: 'mdi:blinds-horizontal',
        name: hasItems
          ? `${count} ${count === 1 ? localize('summary.covers_open_one') : localize('summary.covers_open_many')}`
          : localize('summary.covers_closed'),
        color: hasItems ? 'purple' : 'grey',
        path: 'covers',
      },
      security: {
        icon: 'mdi:security',
        name: hasItems ? `${count} ${localize('summary.security_unsafe')}` : localize('summary.security_safe'),
        color: hasItems ? 'yellow' : 'grey',
        path: 'security',
      },
      batteries: {
        icon: hasItems ? 'mdi:battery-alert' : 'mdi:battery-charging',
        name: hasItems
          ? `${count} ${count === 1 ? localize('summary.batteries_critical_one') : localize('summary.batteries_critical_many')}`
          : localize('summary.batteries_ok'),
        color: hasItems ? 'red' : 'grey',
        path: 'batteries',
      },
      valves: {
        icon: 'mdi:valve',
        name: hasItems
          ? `${count} ${count === 1 ? localize('summary.valves_open_one') : localize('summary.valves_open_many')}`
          : localize('summary.valves_closed'),
        color: hasItems ? 'blue' : 'grey',
        path: 'valves',
      },
      climate: {
        icon: 'mdi:thermostat',
        name: hasItems
          ? `${count} ${count === 1 ? localize('summary.climate_active_one') : localize('summary.climate_active_many')}`
          : localize('summary.climate_off'),
        color: hasItems ? 'orange' : 'grey',
        path: 'climate',
      },
      cameras: {
        icon: 'mdi:cctv',
        name: hasItems
          ? `${count} ${count === 1 ? localize('summary.cameras_one') : localize('summary.cameras_many')}`
          : localize('summary.cameras_off'),
        color: hasItems ? 'blue' : 'grey',
        path: 'cameras',
      },
      air_quality: {
        icon: hasItems
          ? airQualitySummaryStatus === 'critical'
            ? 'mdi:air-filter-alert'
            : 'mdi:air-filter'
          : 'mdi:air-filter',
        name: hasItems
          ? `${count} ${
              count === 1
                ? localize(`summary.air_quality_${airQualitySummaryStatus}_one`)
                : localize(`summary.air_quality_${airQualitySummaryStatus}_many`)
            }`
          : localize('summary.air_quality_ok'),
        color: hasItems ? (airQualitySummaryStatus === 'critical' ? 'red' : 'yellow') : 'grey',
        path: 'air-quality',
      },
    };

    return configs[this._config.summary_type];
  }

  private _getAirQualitySummaryStatus(): AirQualitySummaryStatus {
    if (!this.hass) return 'ok';

    this._getRelevantEntities();
    if (!this._relevantEntityIds || this._relevantEntityIds.size === 0) return 'ok';

    let hasWarning = false;

    for (const id of this._relevantEntityIds) {
      const info = getAirQualityEntityInfo(id, this.hass, this._config);
      if (!info) continue;
      if (info.status === 'critical') return 'critical';
      if (info.status === 'warning') hasWarning = true;
    }

    return hasWarning ? 'warning' : 'ok';
  }

  private _getAirQualityMetricStatus(metric: AirQualityMetric): AirQualityStatus | 'none' {
    if (!this.hass) return 'none';

    const entities = getAirQualityEntities(this.hass, this._config).filter((item) => item.metric === metric);
    if (entities.length === 0) return 'none';
    if (entities.some((item) => item.status === 'critical')) return 'critical';
    if (entities.some((item) => item.status === 'warning')) return 'warning';
    return 'ok';
  }

  private _getAirQualityStatusColor(status: AirQualityStatus | 'none'): string {
    if (status === 'critical') return COLOR_MAP.red;
    if (status === 'warning') return COLOR_MAP.yellow;
    if (status === 'ok') return COLOR_MAP.blue;
    return COLOR_MAP.grey;
  }

  private _getBatterySummaryStatus(): BatterySummaryStatus {
    if (!this.hass) return 'good';
    this._getRelevantEntities();
    if (!this._relevantEntityIds || this._relevantEntityIds.size === 0) return 'good';

    const showUnknownBatteryGroup = this._config.show_unknown_battery_group === true;
    const criticalThreshold = this._config.battery_critical_threshold ?? 20;
    let hasCritical = false;
    let hasUnknown = false;

    for (const id of this._relevantEntityIds) {
      const state = this.hass.states[id];
      if (!state) continue;

      if (id.startsWith('binary_sensor.')) {
        if (state.state === 'on') {
          hasCritical = true;
          break;
        }
        continue;
      }

      const isUnavailable = state.state === 'unavailable' || state.state === 'unknown';
      if (isUnavailable) {
        if (showUnknownBatteryGroup) hasUnknown = true;
        else {
          hasCritical = true;
          break;
        }
        continue;
      }

      const value = parseFloat(state.state);
      if (!isNaN(value) && value < criticalThreshold) {
        hasCritical = true;
        break;
      }
    }

    if (hasCritical) return 'critical';
    if (showUnknownBatteryGroup && hasUnknown) return 'unknown';
    return 'good';
  }

  private _handleClick(): void {
    if (!this.hass) return;
    const displayConfig = this._getDisplayConfig();
    this.dispatchEvent(
      new CustomEvent('hass-action', {
        bubbles: true,
        composed: true,
        detail: {
          config: {
            tap_action: {
              action: 'navigate',
              navigation_path: displayConfig.path,
            },
          },
          action: 'tap',
        },
      })
    );
  }

  protected render() {
    const display = this._getDisplayConfig();
    const colorCss = COLOR_MAP[display.color] || COLOR_MAP.grey;

    if (this._config.summary_type === 'air_quality') {
      const qualityStatus = this._getAirQualityMetricStatus('co2');
      const humidityStatus = this._getAirQualityMetricStatus('humidity');
      const temperatureStatus = this._getAirQualityMetricStatus('temperature');
      const rows = [
        { label: localize('summary.air_quality_row_quality'), status: qualityStatus },
        { label: localize('summary.air_quality_row_humidity'), status: humidityStatus },
        { label: localize('summary.air_quality_row_temperature'), status: temperatureStatus },
      ].filter((row) => row.status !== 'none');

      return html`
        <ha-card @click=${() => this._handleClick()}>
          <ha-icon class="icon" .icon=${display.icon} style="color: ${colorCss}"></ha-icon>
          ${rows.length > 0
            ? html`
                <div class="air-quality-rows">
                  ${rows.map(
                    (row) => html`
                      <div class="air-quality-row">
                        <span class="air-quality-label">${row.label}</span>
                        <span class="air-quality-status" style="color: ${this._getAirQualityStatusColor(row.status)};">
                          ${localize(`air_quality.${row.status}`)}
                        </span>
                      </div>
                    `
                  )}
                </div>
              `
            : html`<div class="name">${display.name}</div>`}
        </ha-card>
      `;
    }

    return html`
      <ha-card @click=${() => this._handleClick()}>
        <ha-icon class="icon" .icon=${display.icon} style="color: ${colorCss}"></ha-icon>
        <div class="name">${display.name}</div>
      </ha-card>
    `;
  }

  getCardSize(): number {
    return 1;
  }
}

customElements.define('simon42-summary-card', Simon42SummaryCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'simon42-summary-card',
  name: 'Simon42 Summary Card',
  description: 'Reactive summary card that counts entities dynamically',
});
