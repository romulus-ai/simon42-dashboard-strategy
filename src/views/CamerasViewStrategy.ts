// ====================================================================
// VIEW STRATEGY — CAMERAS (camera overview)
// ====================================================================

import type { HomeAssistant } from '../types/homeassistant';
import type { LovelaceViewConfig, LovelaceCardConfig } from '../types/lovelace';
import { Registry } from '../Registry';
import { localize } from '../utils/localize';

class Simon42ViewCamerasStrategy extends HTMLElement {
  static async generate(config: any, hass: HomeAssistant): Promise<LovelaceViewConfig> {
    Registry.initialize(hass, config.config || {});

    const cameraIds = Registry.getVisibleEntityIdsForDomain('camera').filter((id) => !!hass.states[id]);

    const cards: LovelaceCardConfig[] = [];
    if (cameraIds.length > 0) {
      cards.push({
        type: 'heading',
        heading: localize('views.cameras'),
        heading_style: 'title',
        icon: 'mdi:cctv',
      });
      cards.push(
        ...cameraIds.map((entityId) => ({
          type: 'picture-entity',
          entity: entityId,
          camera_image: entityId,
          camera_view: 'auto',
          show_name: true,
          show_state: false,
        }))
      );
    }

    return {
      type: 'sections',
      sections: [{ type: 'grid', cards }],
    };
  }
}

customElements.define('ll-strategy-simon42-view-cameras', Simon42ViewCamerasStrategy);
