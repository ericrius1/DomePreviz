import type { Template, TemplateId } from './Template';
import { NullTemplate } from './NullTemplate';
import { PlanetariumTemplate } from './PlanetariumTemplate';
import { TerrainSunsetTemplate } from './TerrainSunsetTemplate';

export type TemplateFactory = () => Template;

export const templateRegistry: Record<TemplateId, TemplateFactory> = {
  planetarium: () => new PlanetariumTemplate(),
  terrain:     () => new TerrainSunsetTemplate(),
  musicviz:    () => new NullTemplate(),
  video360:    () => new NullTemplate(),
};

export function createTemplate(id: TemplateId): Template {
  return templateRegistry[id]();
}
