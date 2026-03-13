/**
 * AI-5: Vaughn Index Document Generator
 * Generates PDF and DOCX files for Vaughn Indexes
 */

import { VaughnIndex, VaughnEntry, VaughnDocumentOptions, VaughnCoverPage, VaughnDeclaration } from '../types';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * Generate PDF document for Vaughn Index
 * Note: This is a simplified implementation. In production, use PDFKit or similar library
 */
export class VaughnDocumentGenerator {
  private outputDir: string;

  constructor(outputDir: string = '/tmp/vaughn-indexes') {
    this.outputDir = outputDir;
  }

  /**
   * Generate complete Vaughn Index PDF
   */
  async generatePDF(
    index: VaughnIndex,
    entries: VaughnEntry[],
    options: VaughnDocumentOptions
  ): Promise<string> {
    // Ensure output directory exists
    await fs.mkdir(this.outputDir, { recursive: true });

    const filename = `vaughn-index-${index.id}.pdf`;
    const filepath = path.join(this.outputDir, filename);

    // Build PDF content
    const content = this.buildPDFContent(index, entries, options);

    // In production, use PDFKit to generate actual PDF
    // For now, create a text representation
    await fs.writeFile(filepath, content, 'utf-8');

    console.log(`[DocumentGenerator] Generated PDF: ${filepath}`);
    return filepath;
  }

  /**
   * Generate DOCX backup document
   */
  async generateDOCX(
    index: VaughnIndex,
    entries: VaughnEntry[],
    options: VaughnDocumentOptions
  ): Promise<string> {
    await fs.mkdir(this.outputDir, { recursive: true });

    const filename = `vaughn-index-${index.id}.docx`;
    const filepath = path.join(this.outputDir, filename);

    // Build DOCX content (simplified - in production use docx library)
    const content = this.buildDOCXContent(index, entries, options);

    await fs.writeFile(filepath, content, 'utf-8');

    console.log(`[DocumentGenerator] Generated DOCX: ${filepath}`);
    return filepath;
  }

  /**
   * Build PDF content structure
   */
  private buildPDFContent(
    index: VaughnIndex,
    entries: VaughnEntry[],
    options: VaughnDocumentOptions
  ): string {
    const sections: string[] = [];

    // AI Disclaimer Header (required on all pages)
    const disclaimer = this.buildDisclaimer();
    sections.push(disclaimer);
    sections.push('\n' + '='.repeat(80) + '\n');

    // Cover Page
    if (options.include_cover_page) {
      const coverPage = this.buildCoverPage({
        agency_name: options.agency_name,
        request_number: index.request_number,
        requester_name: index.requester_name,
        date_generated: index.generated_at,
        entry_count: index.entry_count,
        court_name: options.court_name,
        case_number: options.case_number
      });
      sections.push(coverPage);
      sections.push('\n' + '='.repeat(80) + '\n');
    }

    // Table of Contents
    if (options.include_table_of_contents) {
      const toc = this.buildTableOfContents(entries);
      sections.push(toc);
      sections.push('\n' + '='.repeat(80) + '\n');
    }

    // Vaughn Index Entries
    sections.push(this.buildEntriesSection(entries));
    sections.push('\n' + '='.repeat(80) + '\n');

    // Declaration Page
    if (options.include_declaration_page) {
      const declaration = this.buildDeclarationPage({
        declarant_name: '[TO BE COMPLETED]',
        declarant_title: '[TO BE COMPLETED]',
        agency_name: options.agency_name,
        declaration_date: new Date(),
        signature_placeholder: true
      });
      sections.push(declaration);
    }

    return sections.join('\n\n');
  }

  /**
   * Build AI Disclaimer
   */
  private buildDisclaimer(): string {
    return `╔════════════════════════════════════════════════════════════════════════════╗
║                          AI-ASSISTED DOCUMENT NOTICE                        ║
╚════════════════════════════════════════════════════════════════════════════╝

⚠️  IMPORTANT: This Vaughn Index was AI-assisted.

Legal counsel must:
✓ Review all entries for accuracy and completeness
✓ Verify statutory citations
✓ Ensure exemption explanations are specific and non-conclusory
✓ Confirm segregability analyses meet legal standards
✓ Certify accuracy before filing with court

This disclaimer must be retained with the document.`;
  }

  /**
   * Build cover page
   */
  private buildCoverPage(options: VaughnCoverPage): string {
    const parts: string[] = [];

    parts.push('VAUGHN INDEX');
    parts.push('');
    parts.push(`Agency: ${options.agency_name}`);
    parts.push(`FOIA Request Number: ${options.request_number}`);
    parts.push(`Requester: ${options.requester_name}`);
    parts.push('');
    parts.push(`Date Generated: ${options.date_generated.toLocaleDateString()}`);
    parts.push(`Total Entries: ${options.entry_count}`);

    if (options.court_name) {
      parts.push('');
      parts.push(`Filed in: ${options.court_name}`);
      if (options.case_number) {
        parts.push(`Case Number: ${options.case_number}`);
      }
    }

    parts.push('');
    parts.push('─'.repeat(80));
    parts.push('');
    parts.push('This index describes each document withheld in whole or in part,');
    parts.push('identifies the claimed exemption(s), and explains the basis for');
    parts.push('withholding pursuant to 5 U.S.C. § 552 (Freedom of Information Act).');

    return parts.join('\n');
  }

  /**
   * Build table of contents
   */
  private buildTableOfContents(entries: VaughnEntry[]): string {
    const parts: string[] = [];

    parts.push('TABLE OF CONTENTS');
    parts.push('');
    parts.push('Entry No.  Document Type              Exemption    Page');
    parts.push('─'.repeat(80));

    for (const entry of entries) {
      const entryNum = entry.entry_number.toString().padEnd(10);
      const docType = entry.document_type.substring(0, 25).padEnd(27);
      const exemption = entry.exemption_code.padEnd(12);
      const page = '[TBD]'; // Page numbers would be calculated in real PDF

      parts.push(`${entryNum} ${docType} ${exemption} ${page}`);
    }

    return parts.join('\n');
  }

  /**
   * Build entries section
   */
  private buildEntriesSection(entries: VaughnEntry[]): string {
    const parts: string[] = [];

    parts.push('VAUGHN INDEX ENTRIES');
    parts.push('');

    for (const entry of entries) {
      parts.push(this.formatEntry(entry));
      parts.push('');
      parts.push('─'.repeat(80));
      parts.push('');
    }

    return parts.join('\n');
  }

  /**
   * Format a single Vaughn entry
   */
  private formatEntry(entry: VaughnEntry): string {
    const parts: string[] = [];

    // Entry number
    parts.push(`ENTRY NO. ${entry.entry_number}`);
    parts.push('');

    // Document description
    parts.push('DOCUMENT DESCRIPTION:');
    parts.push(this.wrapText(entry.document_description, 80, '  '));
    parts.push('');

    // Exemption claimed
    parts.push('EXEMPTION CLAIMED:');
    parts.push(`  ${entry.exemption_code} - ${entry.statutory_citation}`);
    parts.push('');

    // Explanation
    parts.push('BASIS FOR WITHHOLDING:');
    // Use edited entry if available, otherwise original
    const explanation = entry.edited_entry || entry.exemption_explanation;
    parts.push(this.wrapText(explanation, 80, '  '));
    parts.push('');

    // Segregability
    parts.push(`SEGREGABILITY: ${entry.withheld_in_full ? 'Withheld in Full' : 'Withheld in Part'}`);
    if (entry.segregability_explanation) {
      parts.push(this.wrapText(entry.segregability_explanation, 80, '  '));
    }

    // Edit tracking (if manually edited)
    if (entry.edited_entry) {
      parts.push('');
      parts.push(`[Edited by legal counsel on ${entry.edited_at?.toLocaleDateString()}]`);
      if (entry.edit_notes) {
        parts.push(`Notes: ${entry.edit_notes}`);
      }
    }

    return parts.join('\n');
  }

  /**
   * Build declaration page
   */
  private buildDeclarationPage(options: VaughnDeclaration): string {
    const parts: string[] = [];

    parts.push('DECLARATION');
    parts.push('');
    parts.push(`I, ${options.declarant_name}, ${options.declarant_title} of ${options.agency_name},`);
    parts.push('hereby declare as follows:');
    parts.push('');
    parts.push('1. I am authorized to make this declaration on behalf of the agency.');
    parts.push('');
    parts.push('2. I have personal knowledge of the matters stated herein or have');
    parts.push('   reviewed the relevant records and consulted with agency personnel');
    parts.push('   who have such knowledge.');
    parts.push('');
    parts.push('3. The attached Vaughn Index describes each document withheld in whole');
    parts.push('   or in part in response to the referenced FOIA request.');
    parts.push('');
    parts.push('4. The explanations provided for each exemption claimed are specific to');
    parts.push('   the document described and are based on the content and context of');
    parts.push('   that document.');
    parts.push('');
    parts.push('5. Where documents are withheld in full, no reasonably segregable portions');
    parts.push('   that are not exempt could be disclosed.');
    parts.push('');
    parts.push('I declare under penalty of perjury that the foregoing is true and correct.');
    parts.push('');
    parts.push(`Executed on ${options.declaration_date.toLocaleDateString()}`);
    parts.push('');

    if (options.signature_placeholder) {
      parts.push('');
      parts.push('_'.repeat(40));
      parts.push(options.declarant_name);
      parts.push(options.declarant_title);
      parts.push(options.agency_name);
    }

    return parts.join('\n');
  }

  /**
   * Build DOCX content (simplified)
   */
  private buildDOCXContent(
    index: VaughnIndex,
    entries: VaughnEntry[],
    options: VaughnDocumentOptions
  ): string {
    // For now, use same structure as PDF
    // In production, use docx library to create actual .docx file
    return this.buildPDFContent(index, entries, options);
  }

  /**
   * Wrap text to specified width
   */
  private wrapText(text: string, width: number, indent: string = ''): string {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = indent;

    for (const word of words) {
      if ((currentLine + word).length > width) {
        lines.push(currentLine);
        currentLine = indent + word + ' ';
      } else {
        currentLine += word + ' ';
      }
    }

    if (currentLine.trim().length > 0) {
      lines.push(currentLine);
    }

    return lines.join('\n');
  }
}
