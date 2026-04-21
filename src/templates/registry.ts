import type { Template, TemplateId } from './Template';
import { NullTemplate } from './NullTemplate';
import { PlanetariumTemplate } from './PlanetariumTemplate';

export type TemplateFactory = () => Template;

export const templateRegistry: Record<TemplateId, TemplateFactory> = {
  planetarium: () => new PlanetariumTemplate(),
  terrain:     () => new NullTemplate(),
  musicviz:    () => new NullTemplate(),
  video360:    () => new NullTemplate(),
};

export function createTemplate(id: TemplateId): Template {
  return templateRegistry[id]();
}
