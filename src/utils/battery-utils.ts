import type { HomeAssistant } from '../types/homeassistant';
import type { Simon42StrategyConfig } from '../types/strategy';
import { filterBatteryEntities } from './entity-filter';

export type BatteryStatus = 'unknown' | 'critical' | 'low' | 'good';

export interface BatteryStatusGroup {
  entities: string[];
}

export interface BatteryStatusDisplay {
  icon: string;
  color: string;
  info: string | null;
}

type BatteryConfig = Pick<
  Simon42StrategyConfig,
  'hide_mobile_app_batteries' | 'show_unknown_battery_group' | 'battery_critical_threshold' | 'battery_low_threshold'
>;

/**
 * Returns the display configuration for each battery status.
 * Thresholds are taken from the config, with defaults if not set.
 */
export function getBatteryStatusDisplay(config: BatteryConfig): Record<BatteryStatus, BatteryStatusDisplay> {
  const criticalThreshold = config.battery_critical_threshold ?? 20;
  const lowThreshold = config.battery_low_threshold ?? 50;

  return {
    unknown: { icon: 'mdi:battery-unknown', color: 'white', info: null },
    critical: { icon: 'mdi:battery-alert', color: 'red', info: `< ${criticalThreshold}%` },
    low: { icon: 'mdi:battery-20', color: 'yellow', info: `${criticalThreshold}% - ${lowThreshold}%` },
    good: { icon: 'mdi:battery', color: 'green', info: `> ${lowThreshold}%` },
  };
}

export function buildBatteryStatusGroups(hass: HomeAssistant, config: BatteryConfig): Record<BatteryStatus, BatteryStatusGroup> {
  const batteryGroups: Record<BatteryStatus, BatteryStatusGroup> = {
    unknown: { entities: [] },
    critical: { entities: [] },
    low: { entities: [] },
    good: { entities: [] },
  };

  const criticalThreshold = config.battery_critical_threshold ?? 20;
  const lowThreshold = config.battery_low_threshold ?? 50;

  const isBinarySensor = (entityId: string) => entityId.startsWith('binary_sensor.');
  const isUnavailableOrUnknown = (state: string) => (state === 'unavailable' || state === 'unknown');

  for (const entityId of filterBatteryEntities(hass, config)) {
    let key: BatteryStatus;

    const state = hass.states[entityId];
    if (config.show_unknown_battery_group && isUnavailableOrUnknown(state.state)) {
      key = 'unknown';
    } else if (isBinarySensor(entityId)) {
      key = state.state === 'on' ? 'critical' : 'good';
    } else {
      const value = parseFloat(state.state);
      if (isNaN(value)) key = 'critical';
      else if (value < criticalThreshold) key = 'critical';
      else if (value <= lowThreshold) key = 'low';
      else key = 'good';
    }

    batteryGroups[key].entities.push(entityId);
  }

  return batteryGroups;
}
