import type { Template, TemplateId } from './Template';
import { PlanetariumTemplate } from './PlanetariumTemplate';
import { TerrainSunsetTemplate } from './TerrainSunsetTemplate';
import { AuroraTemplate } from './aurora/AuroraTemplate';
import { Video360Template } from './Video360Template';

export type TemplateFactory = () => Template;

export const templateRegistry: Record<TemplateId, TemplateFactory> = {
  planetarium: () => new PlanetariumTemplate(),
  terrain:     () => new TerrainSunsetTemplate(),
  aurora:      () => new AuroraTemplate(),
  video360:    () => new Video360Template(),
};

export function createTemplate(id: TemplateId): Template {
  return templateRegistry[id]();
}
