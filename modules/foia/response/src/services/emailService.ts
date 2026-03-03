/**
 * FOIA Email Service
 * Handles email delivery using nodemailer
 */

import nodemailer, { Transporter } from 'nodemailer';
import { EmailDeliveryOptions } from '../types';

/**
 * Email Service
 */
export class EmailService {
  private transporter: Transporter;

  constructor() {
    // Configure SMTP transport
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'localhost',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
      auth: process.env.SMTP_USER && process.env.SMTP_PASS ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      } : undefined,
      tls: {
        rejectUnauthorized: process.env.NODE_ENV === 'production'
      }
    });
  }

  /**
   * Send email
   */
  async sendEmail(options: EmailDeliveryOptions): Promise<{
    success: boolean;
    message_id?: string;
    error?: string;
  }> {
    try {
      const mailOptions = {
        from: options.from || process.env.SMTP_FROM || 'noreply@example.com',
        to: options.to,
        subject: options.subject,
        text: options.body_text,
        html: options.body_html,
        replyTo: options.reply_to,
        attachments: options.attachments
      };

      const info = await this.transporter.sendMail(mailOptions);

      console.log('[EmailService] Email sent:', info.messageId);

      return {
        success: true,
        message_id: info.messageId
      };
    } catch (error) {
      console.error('[EmailService] Send error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown email error'
      };
    }
  }

  /**
   * Verify SMTP connection
   */
  async verifyConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      console.log('[EmailService] SMTP connection verified');
      return true;
    } catch (error) {
      console.error('[EmailService] SMTP verification failed:', error);
      return false;
    }
  }

  /**
   * Send FOIA response email
   */
  async sendFoiaResponse(
    to: string,
    subject: string,
    body_text: string,
    body_html?: string,
    attachments?: EmailDeliveryOptions['attachments']
  ): Promise<{
    success: boolean;
    message_id?: string;
    error?: string;
  }> {
    return this.sendEmail({
      to,
      subject,
      body_text,
      body_html,
      attachments,
      from: process.env.FOIA_EMAIL_FROM || process.env.SMTP_FROM,
      reply_to: process.env.FOIA_EMAIL_REPLY_TO
    });
  }
}
