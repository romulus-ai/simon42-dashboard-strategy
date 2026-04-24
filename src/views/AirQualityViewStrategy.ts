// ====================================================================
// VIEW STRATEGY — AIR QUALITY (CO2, Humidity, Temperature)
// ====================================================================

import type { HomeAssistant } from '../types/homeassistant';
import type { LovelaceViewConfig, LovelaceSectionConfig } from '../types/lovelace';
import { Registry } from '../Registry';
import { localize } from '../utils/localize';
import { getAirQualityEntities, type AirQualityStatus } from '../utils/entity-filter';

function createAirQualitySection(
  entityIds: string[],
  status: AirQualityStatus,
  color: 'red' | 'yellow' | 'green'
): LovelaceSectionConfig | null {
  if (entityIds.length === 0) return null;

  return {
    type: 'grid',
    cards: [
      {
        type: 'heading',
        heading: `${localize(`air_quality.${status}`)} (${entityIds.length})`,
        heading_style: 'title',
      },
      ...entityIds.map((entityId) => ({
        type: 'tile',
        entity: entityId,
        vertical: false,
        state_content: ['state', 'last_changed'],
        color,
      })),
    ],
  };
}

class Simon42ViewAirQualityStrategy extends HTMLElement {
  static async generate(config: any, hass: HomeAssistant): Promise<LovelaceViewConfig> {
    Registry.initialize(hass, config.config || {});

    const entities = getAirQualityEntities(hass, config.config || {});

    entities.sort((a, b) => {
      if (a.metric !== b.metric) return a.metric.localeCompare(b.metric);
      return b.value - a.value;
    });

    const critical = entities.filter((item) => item.status === 'critical').map((item) => item.entityId);
    const warning = entities.filter((item) => item.status === 'warning').map((item) => item.entityId);
    const ok = entities.filter((item) => item.status === 'ok').map((item) => item.entityId);

    const sections: LovelaceSectionConfig[] = [];

    const criticalSection = createAirQualitySection(critical, 'critical', 'red');
    if (criticalSection) sections.push(criticalSection);

    const warningSection = createAirQualitySection(warning, 'warning', 'yellow');
    if (warningSection) sections.push(warningSection);

    const okSection = createAirQualitySection(ok, 'ok', 'green');
    if (okSection) sections.push(okSection);

    return { type: 'sections', sections };
  }
}

customElements.define('ll-strategy-simon42-view-air-quality', Simon42ViewAirQualityStrategy);
