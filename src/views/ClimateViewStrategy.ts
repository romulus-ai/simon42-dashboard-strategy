// ====================================================================
// VIEW STRATEGY — CLIMATE (Climate/Thermostat Overview)
// ====================================================================

import type { HomeAssistant } from '../types/homeassistant';
import type { LovelaceViewConfig, LovelaceSectionConfig } from '../types/lovelace';
import { Registry } from '../Registry';
import { localize } from '../utils/localize';

class Simon42ViewClimateStrategy extends HTMLElement {
  static async generate(config: any, hass: HomeAssistant): Promise<LovelaceViewConfig> {
    // Ensure Registry is initialized (idempotent — no-op if already done)
    Registry.initialize(hass, config.config || {});

    const climateIds = Registry.getVisibleEntityIdsForDomain('climate').filter(
      (id) => hass.states[id] !== undefined
    );
    const humidifierIds = Registry.getVisibleEntityIdsForDomain('humidifier').filter(
      (id) => hass.states[id] !== undefined
    );
    const climateAndHumidifierIds = [...climateIds, ...humidifierIds];

    // Group by hvac_action or state
    const heating: string[] = [];
    const cooling: string[] = [];
    const dehumidifier: string[] = [];
    const humidity: string[] = [];
    const idle: string[] = [];
    const off: string[] = [];

    for (const id of climateAndHumidifierIds) {
      const state = hass.states[id];
      const domain = id.split('.')[0];

      if (domain === 'humidifier') {
        const deviceClass = state.attributes?.device_class as string | undefined;
        const mode = state.attributes?.mode as string | undefined;

        if (state.state === 'off' || state.state === 'unavailable' || state.state === 'unknown') {
          off.push(id);
        } else if (deviceClass === 'dehumidifier' || deviceClass === 'dehumidifer') {
          dehumidifier.push(id);
        } else if (mode === 'Set' || mode === 'Smart' || mode === 'Continuous' || mode === 'Dry') {
          humidity.push(id);
        } else {
          idle.push(id);
        }
        continue;
      }

      const hvacAction = state.attributes?.hvac_action as string | undefined;
      const hvacState = state.state;

      if (hvacState === 'off' || hvacState === 'unavailable' || hvacState === 'unknown') {
        off.push(id);
      } else if (hvacAction === 'heating' || (!hvacAction && hvacState === 'heat')) {
        heating.push(id);
      } else if (hvacAction === 'cooling' || (!hvacAction && hvacState === 'cool')) {
        cooling.push(id);
      } else {
        // idle, drying, fan, auto without action, etc.
        idle.push(id);
      }
    }

    const sections: LovelaceSectionConfig[] = [];

    const buildSection = (
      entities: string[],
      heading: string,
      icon: string
    ): void => {
      if (entities.length === 0) return;
      sections.push({
        type: 'grid',
        cards: [
          {
            type: 'heading',
            heading: `${heading} (${entities.length})`,
            heading_style: 'title',
            icon,
          },
          ...entities.map((e) => ({
            type: 'tile',
            entity: e,
            vertical: false,
            features: [
              {
                type: e.startsWith('humidifier.') ? 'humidifier-toggle' : 'climate-hvac-modes',
              },
            ],
            features_position: 'inline',
                        state_content: e.startsWith('humidifier.')
              ? ['mode', 'humidity', 'current_humidity']
              : ['hvac_action', 'current_temperature'],
          })),
        ],
      });
    };

    buildSection(heating, localize('climate.heating'), 'mdi:fire');
    buildSection(cooling, localize('climate.cooling'), 'mdi:snowflake');
    buildSection(dehumidifier, localize('climate.dehumidifier'), 'mdi:air-humidifier-off');
    buildSection(humidity, localize('climate.humidity'), 'mdi:air-humidifier');
    buildSection(idle, localize('climate.idle'), 'mdi:thermostat');
    buildSection(off, localize('climate.off'), 'mdi:power-off');

    return { type: 'sections', sections };
  }
}

customElements.define('ll-strategy-simon42-view-climate', Simon42ViewClimateStrategy);
