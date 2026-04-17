// ====================================================================
// VIEW STRATEGY — BATTERIES (Battery Status Overview)
// ====================================================================

import type { HomeAssistant } from '../types/homeassistant';
import type { LovelaceViewConfig, LovelaceSectionConfig } from '../types/lovelace';
import { Registry } from '../Registry';
import { localize } from '../utils/localize';
import { getBatteryEntities } from '../utils/entity-filter';

function createBatterySection(
  entities: string[],
  status: 'unknown' | 'critical' | 'low' | 'good',
  rangeText: string | null,
): LovelaceSectionConfig | null {

  if (entities.length === 0) return null;

  const oneOrMany = entities.length === 1 ? 'battery_one' : 'battery_many';

  const style: Record<string, { icon: string; color: string }> = {
    'unknown':  { icon: 'mdi:battery-unknown', color: 'white', },
    'critical': { icon: 'mdi:battery-alert', color: 'red' },
    'low': { icon: 'mdi:battery-20', color: 'yellow' },
    'good': { icon: 'mdi:battery', color: 'green' },
  };

  return {
    type: 'grid',
    cards: [
      {
        type: 'heading',
        icon: style[status].icon,
        heading: `${localize('batteries.' + status)} ` + (rangeText ? `(${rangeText})` : '') +
            ` - ${entities.length} ${localize('batteries.' + oneOrMany)}`,
        heading_style: 'title',
      },
      ...entities.map((e) => ({
        type: 'tile',
        entity: e,
        vertical: false,
        state_content: ['state', 'last_changed'],
        color: style[status].color,
      })),
    ],
  };
}

class Simon42ViewBatteriesStrategy extends HTMLElement {
  static async generate(config: any, hass: HomeAssistant): Promise<LovelaceViewConfig> {
    // Ensure Registry is initialized (idempotent — no-op if already done)
    Registry.initialize(hass, config.config || {});

    const batteryEntities = getBatteryEntities(hass, config.config);

    // Group by status
    const strategyConfig = config.config || {};
    const criticalThreshold = strategyConfig.battery_critical_threshold ?? 20;
    const lowThreshold = strategyConfig.battery_low_threshold ?? 50;
    const unknown: string[] = [];
    const critical: string[] = [];
    const low: string[] = [];
    const good: string[] = [];

    for (const entityId of batteryEntities) {
      const state = hass.states[entityId];
      if (strategyConfig.show_unknown_battery_group && (state.state === 'unavailable' || state.state === 'unknown')) {
        unknown.push(entityId);
        continue;
      }
      if (entityId.startsWith('binary_sensor.')) {
        (state.state === 'on' ? critical : good).push(entityId);
        continue;
      }
      const value = parseFloat(state.state);
      const unit = state.attributes?.unit_of_measurement;
      // Only apply percentage thresholds to %-based sensors.
      // Voltage sensors (V, mV) have device-specific ranges and cannot be
      // meaningfully compared against percentage thresholds (e.g. 3V would
      // be "critical" at < 20 which is wrong). Skip them entirely.
      if (unit && unit !== '%') continue;
      if (isNaN(value)) critical.push(entityId);
      else if (value < criticalThreshold) critical.push(entityId);
      else if (value <= lowThreshold) low.push(entityId);
      else good.push(entityId);
    }

    // Sort each group by battery level (lowest first)
    const sortByLevel = (a: string, b: string): number => {
      const valA = parseFloat(hass.states[a]?.state);
      const valB = parseFloat(hass.states[b]?.state);
      if (isNaN(valA)) return -1;
      if (isNaN(valB)) return 1;
      return valA - valB;
    };
    unknown.sort(sortByLevel);
    critical.sort(sortByLevel);
    low.sort(sortByLevel);
    good.sort(sortByLevel);

    const sections: LovelaceSectionConfig[] = [];

    const unknownSection = createBatterySection(unknown, 'unknown', null);
    if (unknownSection) sections.push(unknownSection);

    const criticalSection = createBatterySection(critical, 'critical', `< ${criticalThreshold}%`);
    if (criticalSection) sections.push(criticalSection);

    const lowSection = createBatterySection(low, 'low', `${criticalThreshold}% - ${lowThreshold}%`);
    if (lowSection) sections.push(lowSection);

    const goodSection = createBatterySection(good, 'good', `> ${lowThreshold}%`);
    if (goodSection) sections.push(goodSection);

    return { type: 'sections', sections };
  }
}

customElements.define('ll-strategy-simon42-view-batteries', Simon42ViewBatteriesStrategy);
