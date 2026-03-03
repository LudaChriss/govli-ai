/**
 * FOIA Template Service
 * Handles Handlebars template rendering
 */

import Handlebars from 'handlebars';
import fs from 'fs';
import path from 'path';
import { ResponseType, TemplateData } from '../types';

/**
 * Template Service
 */
export class TemplateService {
  private templates: Map<ResponseType, HandlebarsTemplateDelegate<TemplateData>>;

  constructor() {
    this.templates = new Map();
    this.loadTemplates();
  }

  /**
   * Load all Handlebars templates
   */
  private loadTemplates() {
    const templateDir = path.join(__dirname, '../templates');

    const templateFiles: Record<ResponseType, string> = {
      FULL_GRANT: 'full_grant.hbs',
      PARTIAL_GRANT: 'partial_grant.hbs',
      FULL_DENIAL: 'full_denial.hbs',
      NO_RESPONSIVE_RECORDS: 'no_responsive_records.hbs',
      FEE_WAIVER_DENIAL: 'fee_waiver_denial.hbs',
      ACKNOWLEDGMENT: 'acknowledgment.hbs'
    };

    for (const [type, filename] of Object.entries(templateFiles)) {
      const templatePath = path.join(templateDir, filename);

      if (fs.existsSync(templatePath)) {
        const source = fs.readFileSync(templatePath, 'utf-8');
        const template = Handlebars.compile<TemplateData>(source);
        this.templates.set(type as ResponseType, template);
        console.log(`[TemplateService] Loaded template: ${type}`);
      } else {
        console.warn(`[TemplateService] Template not found: ${templatePath}`);
      }
    }
  }

  /**
   * Render template
   */
  renderTemplate(responseType: ResponseType, data: TemplateData): string {
    const template = this.templates.get(responseType);

    if (!template) {
      throw new Error(`Template not found for response type: ${responseType}`);
    }

    return template(data);
  }

  /**
   * Get all available templates
   */
  getAvailableTemplates(): ResponseType[] {
    return Array.from(this.templates.keys());
  }

  /**
   * Check if template exists
   */
  hasTemplate(responseType: ResponseType): boolean {
    return this.templates.has(responseType);
  }
}

// Register Handlebars helpers
Handlebars.registerHelper('formatDate', function(date: Date) {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
});

Handlebars.registerHelper('currency', function(amount: number) {
  if (amount === undefined || amount === null) return '$0.00';
  return `$${amount.toFixed(2)}`;
});
