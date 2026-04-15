// ====================================================================
// VIEW STRATEGY — VALVES (Valve Overview)
// ====================================================================

import type { HomeAssistant } from '../types/homeassistant';
import type { LovelaceViewConfig, LovelaceSectionConfig } from '../types/lovelace';
import { Registry } from '../Registry';
import { localize } from '../utils/localize';

class Simon42ViewValvesStrategy extends HTMLElement {
  static async generate(config: any, hass: HomeAssistant): Promise<LovelaceViewConfig> {
    Registry.initialize(hass, config.config || {});

    const valveIds = Registry.getVisibleEntityIdsForDomain('valve').filter((id) => hass.states[id] !== undefined);

    const open: string[] = [];
    const closed: string[] = [];

    for (const id of valveIds) {
      const state = hass.states[id]?.state;
      if (state === 'open' || state === 'opening') {
        open.push(id);
      } else {
        closed.push(id);
      }
    }

    const buildSection = (
      entities: string[],
      heading: string,
      icon: string,
      action: 'valve.open_valve' | 'valve.close_valve',
      actionIcon: string,
      actionLabel: string
    ): LovelaceSectionConfig | null => {
      if (entities.length === 0) return null;

      return {
        type: 'grid',
        cards: [
          {
            type: 'heading',
            heading: `${heading} (${entities.length})`,
            heading_style: 'title',
            icon,
            badges: [
              {
                type: 'button',
                icon: actionIcon,
                text: actionLabel,
                tap_action: {
                  action: 'perform-action',
                  perform_action: action,
                  target: { entity_id: entities },
                },
              },
            ],
          },
          ...entities.map((e) => ({
            type: 'tile',
            entity: e,
            vertical: false,
            features: [{ type: 'valve-open-close' }],
            features_position: 'inline',
            state_content: 'last_changed',
          })),
        ],
      };
    };

    const sections: LovelaceSectionConfig[] = [];

    const openSection = buildSection(
      open,
      localize('valves.open'),
      'mdi:valve-open',
      'valve.close_valve',
      'mdi:arrow-down',
      localize('valves.close_all')
    );
    if (openSection) sections.push(openSection);

    const closedSection = buildSection(
      closed,
      localize('valves.closed'),
      'mdi:valve-closed',
      'valve.open_valve',
      'mdi:arrow-up',
      localize('valves.open_all')
    );
    if (closedSection) sections.push(closedSection);

    return { type: 'sections', sections };
  }
}

customElements.define('ll-strategy-simon42-view-valves', Simon42ViewValvesStrategy);
