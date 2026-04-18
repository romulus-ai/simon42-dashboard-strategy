// ====================================================================
// VIEW STRATEGY — BATTERIES (Battery Status Overview)
// ====================================================================

import type { HomeAssistant } from '../types/homeassistant';
import type { LovelaceViewConfig, LovelaceSectionConfig } from '../types/lovelace';
import { Registry } from '../Registry';
import { type BatteryStatus, type BatteryStatusGroup, buildBatteryStatusGroups, getBatteryStatusDisplay } from '../utils/battery-utils';
import { localize } from '../utils/localize';

type BatteryStatusKeys = BatteryStatus[];

/**
 * Smart Grid Layout:
 * Groups battery status groups into 1-3 grid sections based on their entity counts, to optimize visual balance and minimize empty space.
 * - If all groups have very few entities, they are combined into a single section.
 * - If one group has significantly more entities than the others, it gets its own section, while smaller groups are combined.
 */
function smartGridGrouping(batteryGroups: Record<BatteryStatus, BatteryStatusGroup>): BatteryStatusKeys[] {

  // Determine the maximum entity count among groups with entities (ignoring empty groups)
  const maxEntities = [...Object.values(batteryGroups)]
    .filter((group) => group.entities.length > 0)
    .reduce((max, group) => Math.max(max, group.entities.length), 0);

  // Loop through each group and assign to grid groups based on count relative to maxEntities
  let numEntities = 0;
  let groupKeys: BatteryStatusKeys[] = [];
  for (const [key, group] of Object.entries(batteryGroups) as Array<[BatteryStatus, BatteryStatusGroup]>) {
    numEntities += group.entities.length;
    if (numEntities === 0) continue;

    // If adding this group would exceed 75% of maxEntities, start a new grid group
    if (groupKeys.length !== 0 && (numEntities <= maxEntities * 0.75)) {
      groupKeys[groupKeys.length - 1].push(key);
    } else {
      groupKeys.push([key]);
    }
  }

  // If we still ended up still with 4 groups, merge the first and last two groups to a 2-column grid
  if (groupKeys.length === 4) {
    return [[groupKeys[0][0], groupKeys[1][0]], [groupKeys[2][0], groupKeys[3][0]]];
  }
  return groupKeys;
}

class Simon42ViewBatteriesStrategy extends HTMLElement {
  static async generate(config: any, hass: HomeAssistant): Promise<LovelaceViewConfig> {
    // Ensure Registry is initialized (idempotent — no-op if already done)
    Registry.initialize(hass, config.config || {});

    const strategyConfig = config.config || {};
    const batteryGroups = buildBatteryStatusGroups(hass, strategyConfig);
    const batteryGroupStyles = getBatteryStatusDisplay(strategyConfig);
  
    const sections: LovelaceSectionConfig[] = [];

    // Build sections based on grid groups
    for (const gridGroupKeys of smartGridGrouping(batteryGroups)) {
      const cards: any[] = [];

      // Build sections based on grid groups
      for (const key of gridGroupKeys) {
        
        const entities = batteryGroups[key].entities;
        if (!entities || entities.length === 0) continue;

        entities.sort((a: string, b: string) => {
          const valA = parseFloat(hass.states[a]?.state);
          const valB = parseFloat(hass.states[b]?.state);
          if (isNaN(valA)) return -1;
          if (isNaN(valB)) return 1;
          return valA - valB;
        });

        const style = batteryGroupStyles[key];
        const oneOrMany = entities.length === 1 ? 'battery_one' : 'battery_many';
        cards.push({
          type: 'heading',
          heading: `${localize('batteries.' + key)} ` + (style.info ? `(${style.info})` : '') +
            ` - ${entities.length} ${localize('batteries.' + oneOrMany)}`,
          heading_style: 'title',
          icon: style.icon,
        });
        cards.push(...entities.map((e: string) => ({
          type: 'tile',
          entity: e,
          vertical: false,
          state_content: ['state', 'last_changed'],
          color: style.color,
        })));
      }

      if (cards.length > 0) {
        sections.push({
          type: 'grid',
          cards,
        });
      }
    }

    return { type: 'sections', sections };
  }
}

customElements.define('ll-strategy-simon42-view-batteries', Simon42ViewBatteriesStrategy);
