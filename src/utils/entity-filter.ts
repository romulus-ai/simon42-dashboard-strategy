// ====================================================================
// ENTITY FILTER — Central entity filtering utilities
// ====================================================================
// Uses Registry for pre-computed exclusion sets and Maps.
// Replaces the scattered filtering logic from data-collectors.js.
// ====================================================================

import { Registry } from '../Registry';
import type { HomeAssistant } from '../types/homeassistant';
import type { Simon42StrategyConfig, PersonData } from '../types/strategy';

export type AirQualityMetric = 'co2' | 'humidity' | 'temperature';
export type AirQualityStatus = 'critical' | 'warning' | 'ok';

export interface AirQualityEntityInfo {
  entityId: string;
  metric: AirQualityMetric;
  value: number;
  status: AirQualityStatus;
}

/**
 * Collects person entities with home/away state.
 * Uses pre-filtered Registry method — no manual exclusion checks needed.
 */
export function collectPersons(hass: HomeAssistant, _config: Simon42StrategyConfig): PersonData[] {
  const personIds = Registry.getVisibleEntityIdsForDomain('person');

  return personIds
    .filter((id) => !!hass.states[id])
    .map((id) => {
      const state = hass.states[id];
      return {
        entity_id: id,
        name: state.attributes?.friendly_name || id.split('.')[1],
        state: state.state,
        isHome: state.state === 'home',
      };
    });
}

/**
 * Finds the first available weather entity.
 * Uses pre-filtered Registry method — no manual exclusion checks needed.
 */
export function findWeatherEntity(hass: HomeAssistant): string | undefined {
  const weatherIds = Registry.getVisibleEntityIdsForDomain('weather');
  return weatherIds.find((id) => !!hass.states[id]);
}

/**
 * Finds a dummy sensor entity for tile card color rendering.
 * Uses pre-filtered Registry method — no manual exclusion checks needed.
 * Cached per call — should only be called once per generate().
 */
export function findDummySensor(hass: HomeAssistant): string {
  const sensorIds = Registry.getVisibleEntityIdsForDomain('sensor');
  for (const id of sensorIds) {
    const state = hass.states[id];
    if (!state) continue;
    if (state.state === 'unavailable' || state.state === 'unknown') continue;
    return id;
  }
  // Fallback: try any visible light
  const lightIds = Registry.getVisibleEntityIdsForDomain('light');
  for (const id of lightIds) {
    const state = hass.states[id];
    if (state) return id;
  }
  return 'sun.sun';
}

/**
 * Platforms that create binary_sensor entities with security-like device_classes
 * (opening, door, window) but are NOT actual physical security sensors.
 * Excluded from SecurityView and security SummaryCard count.
 */
export const SECURITY_EXCLUDED_PLATFORMS = new Set(['tankerkoenig']);

function getAirQualityThresholds(config: Simon42StrategyConfig) {
  return {
    co2Warning: config.air_quality_co2_warning_threshold ?? 1000,
    co2Critical: config.air_quality_co2_critical_threshold ?? 1500,
    humidityWarningMin: config.air_quality_humidity_warning_min ?? 35,
    humidityWarningMax: config.air_quality_humidity_warning_max ?? 60,
    humidityCriticalMin: config.air_quality_humidity_critical_min ?? 30,
    humidityCriticalMax: config.air_quality_humidity_critical_max ?? 70,
    temperatureWarningMin: config.air_quality_temperature_warning_min ?? 18,
    temperatureWarningMax: config.air_quality_temperature_warning_max ?? 27,
    temperatureCriticalMin: config.air_quality_temperature_critical_min ?? 16,
    temperatureCriticalMax: config.air_quality_temperature_critical_max ?? 30,
  };
}

function getConfiguredAirQualityEntitiesByMetric(config: Simon42StrategyConfig): Record<AirQualityMetric, string[]> {
  return {
    co2: (config.air_quality_entities?.co2 || []).filter((id) => typeof id === 'string' && id.length > 0),
    humidity: (config.air_quality_entities?.humidity || []).filter((id) => typeof id === 'string' && id.length > 0),
    temperature: (config.air_quality_entities?.temperature || []).filter(
      (id) => typeof id === 'string' && id.length > 0
    ),
  };
}

function getConfiguredAirQualityMetric(entityId: string, config: Simon42StrategyConfig): AirQualityMetric | null {
  const configured = getConfiguredAirQualityEntitiesByMetric(config);
  if (configured.co2.includes(entityId)) return 'co2';
  if (configured.humidity.includes(entityId)) return 'humidity';
  if (configured.temperature.includes(entityId)) return 'temperature';
  return null;
}

function getAirQualityStatus(metric: AirQualityMetric, value: number, config: Simon42StrategyConfig): AirQualityStatus {
  const thresholds = getAirQualityThresholds(config);

  if (metric === 'co2') {
    if (value >= thresholds.co2Critical) return 'critical';
    if (value >= thresholds.co2Warning) return 'warning';
    return 'ok';
  }

  if (metric === 'humidity') {
    if (value <= thresholds.humidityCriticalMin || value >= thresholds.humidityCriticalMax) return 'critical';
    if (value <= thresholds.humidityWarningMin || value >= thresholds.humidityWarningMax) return 'warning';
    return 'ok';
  }

  if (value <= thresholds.temperatureCriticalMin || value >= thresholds.temperatureCriticalMax) return 'critical';
  if (value <= thresholds.temperatureWarningMin || value >= thresholds.temperatureWarningMax) return 'warning';
  return 'ok';
}

export function getAirQualityEntities(hass: HomeAssistant, config: Simon42StrategyConfig): AirQualityEntityInfo[] {
  const result: AirQualityEntityInfo[] = [];
  const configured = getConfiguredAirQualityEntitiesByMetric(config);

  for (const metric of ['co2', 'humidity', 'temperature'] as const) {
    for (const entityId of configured[metric]) {
      const state = hass.states[entityId];
      if (!state) continue;
      if (state.state === 'unavailable' || state.state === 'unknown') continue;

      const value = parseFloat(state.state);
      if (isNaN(value)) continue;

      result.push({
        entityId,
        metric,
        value,
        status: getAirQualityStatus(metric, value, config),
      });
    }
  }

  const deduplicatedByEntity = new Map<string, AirQualityEntityInfo>();
  for (const info of result) {
    if (!deduplicatedByEntity.has(info.entityId)) {
      deduplicatedByEntity.set(info.entityId, info);
    }
  }

  return Array.from(deduplicatedByEntity.values());
}

export function getAirQualityEntityInfo(
  entityId: string,
  hass: HomeAssistant,
  config: Simon42StrategyConfig
): AirQualityEntityInfo | null {
  const state = hass.states[entityId];
  if (!state) return null;
  if (state.state === 'unavailable' || state.state === 'unknown') return null;

  const value = parseFloat(state.state);
  if (isNaN(value)) return null;

  const metric = getConfiguredAirQualityMetric(entityId, config);
  if (!metric) return null;

  return {
    entityId,
    metric,
    value,
    status: getAirQualityStatus(metric, value, config),
  };
}

export function getBatteryEntities(hass: HomeAssistant, config: Simon42StrategyConfig): string[] {
  const sensorIds = Registry.getEntityIdsForDomain('sensor');
  const binarySensorIds = Registry.getEntityIdsForDomain('binary_sensor');

  // Filter battery entities — exclude hidden/no_dboard but keep diagnostic
  const batteryEntities = [...sensorIds, ...binarySensorIds].filter((entityId) => {
    const state = hass.states[entityId];
    if (!state) return false;

    // Exclude hidden and no_dboard entities (but NOT diagnostic — batteries are often diagnostic)
    if (Registry.isExcludedByLabel(entityId)) return false;
    if (Registry.isHiddenByConfig(entityId)) return false;

    const entry = Registry.getEntity(entityId);
    if (entry?.hidden) return false;
    // Platform-specific filter: hide mobile_app batteries if configured
    if (config.hide_mobile_app_batteries) {
      if (entry?.platform === 'mobile_app') return false;
    }

    if (entityId.startsWith('binary_sensor.') && entityId.includes('battery')) return true;
    if (state.attributes?.device_class === 'battery' && state.attributes?.unit_of_measurement === '%') return true;
    return false;
  });

  // Deduplication: remove binary_sensor if %-sensor exists on same device
  const sensorDeviceIds = new Set<string>();
  for (const id of batteryEntities) {
    if (id.startsWith('sensor.')) {
      const deviceId = hass.entities[id]?.device_id;
      if (deviceId) sensorDeviceIds.add(deviceId);
    }
  }

  return batteryEntities.filter((id) => {
    if (!id.startsWith('binary_sensor.')) return true;
    const deviceId = hass.entities[id]?.device_id;
    return !deviceId || !sensorDeviceIds.has(deviceId);
  });
}
