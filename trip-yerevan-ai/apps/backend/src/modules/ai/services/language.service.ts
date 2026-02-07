import { Injectable } from '@nestjs/common';
import { SupportedLanguage, TemplateKey } from '../types';
import { TEMPLATES } from '../constants';

const ARMENIAN_RANGE = /[\u0530-\u058F]/;
const CYRILLIC_RANGE = /[\u0400-\u04FF]/;

@Injectable()
export class LanguageService {
  detectLanguage(text: string): SupportedLanguage {
    if (ARMENIAN_RANGE.test(text)) return 'AM';
    if (CYRILLIC_RANGE.test(text)) return 'RU';
    return 'EN';
  }

  getTemplate(key: TemplateKey, language: SupportedLanguage): string {
    return TEMPLATES[key]?.[language] ?? TEMPLATES[key]?.['EN'] ?? '';
  }

  interpolate(
    template: string,
    variables: Record<string, string>,
  ): string {
    return Object.entries(variables).reduce(
      (result, [key, value]) => result.replace(new RegExp(`\\{${key}\\}`, 'g'), value),
      template,
    );
  }
}
