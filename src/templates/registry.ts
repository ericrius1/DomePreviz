import type { Template, TemplateId } from './Template';
import { NullTemplate } from './NullTemplate';
import { PlanetariumTemplate } from './PlanetariumTemplate';
import { TerrainSunsetTemplate } from './TerrainSunsetTemplate';
import { MusicVizTemplate } from './MusicVizTemplate';

export type TemplateFactory = () => Template;

export const templateRegistry: Record<TemplateId, TemplateFactory> = {
  planetarium: () => new PlanetariumTemplate(),
  terrain:     () => new TerrainSunsetTemplate(),
  musicviz:    () => new MusicVizTemplate(),
  video360:    () => new NullTemplate(),
};

export function createTemplate(id: TemplateId): Template {
  return templateRegistry[id]();
}
