const nodemailer = require('nodemailer');

// Support both Firebase Functions config and local .env
try {
  const functions = require('firebase-functions');
  const config = functions.config();
  process.env.SMTP_HOST = config.smtp?.host || process.env.SMTP_HOST;
  process.env.SMTP_PORT = config.smtp?.port || process.env.SMTP_PORT;
  process.env.SMTP_SECURE = config.smtp?.secure || process.env.SMTP_SECURE;
  process.env.SMTP_USER = config.smtp?.user || process.env.SMTP_USER;
  process.env.SMTP_PASS = config.smtp?.pass || process.env.SMTP_PASS;
  process.env.SMTP_FROM = config.smtp?.from || process.env.SMTP_FROM;
} catch (e) {
  // Running locally, use .env file
  require('dotenv').config();
}

// Create reusable transporter with SMTP settings
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true' || parseInt(process.env.SMTP_PORT || '587') === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Send a password reset verification code email
 * @param {string} to - Recipient email
 * @param {string} code - 6-digit verification code
 */
async function sendPasswordResetCode(to, code) {
  const fromName = process.env.SMTP_FROM || 'Payjay Trends <noreply@payjaytrends.com>';

  const mailOptions = {
    from: fromName,
    to,
    subject: 'Password Reset Code - Payjay Trends',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: 'Outfit', Arial, sans-serif; background: #f9f9f9; margin: 0; padding: 0; }
          .container { max-width: 480px; margin: 30px auto; background: #ffffff; border-radius: 0; overflow: hidden; }
          .header { background: #111111; padding: 30px; text-align: center; }
          .header h1 { color: #ffffff; font-size: 18px; margin: 0; letter-spacing: 0.08em; text-transform: uppercase; }
          .body { padding: 40px 30px; }
          .body h2 { font-size: 14px; color: #111111; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 800; margin-bottom: 10px; }
          .body p { font-size: 14px; color: #767676; line-height: 1.6; margin-bottom: 20px; }
          .code-box { background: #f9f9f9; border: 2px solid #111111; padding: 20px; text-align: center; margin: 20px 0; }
          .code-box .code { font-size: 36px; font-weight: 800; color: #111111; letter-spacing: 8px; }
          .footer { padding: 20px 30px; border-top: 1px solid #e5e5e5; text-align: center; }
          .footer p { font-size: 11px; color: #767676; margin: 0; text-transform: uppercase; letter-spacing: 0.08em; }
          .warning { font-size: 11px; color: #999; text-align: center; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Payjay Trends</h1>
          </div>
          <div class="body">
            <h2>Password Reset Request</h2>
            <p>We received a request to reset your password for your Payjay Trends account. Use the verification code below to proceed:</p>
            <div class="code-box">
              <div class="code">${code}</div>
            </div>
            <p>This code will expire in <strong>15 minutes</strong>. If you did not request a password reset, please ignore this email.</p>
            <div class="warning">
              <p>For security reasons, never share this code with anyone. Our team will never ask for your password or verification code.</p>
            </div>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Payjay Trends. All rights reserved.</p>
            <p style="margin-top: 5px;">Accra, Ghana</p>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Password reset email sent to ${to}: ${info.messageId}`);
    return true;
  } catch (err) {
    console.error(`❌ Failed to send password reset email to ${to}:`, err.message);
    // Don't throw - we want the API to still return success to prevent email enumeration
    return false;
  }
}

/**
 * Send a welcome email after account creation
 * @param {string} to - Recipient email
 * @param {string} name - Customer name
 */
async function sendWelcomeEmail(to, name) {
  const fromName = process.env.SMTP_FROM || 'Payjay Trends <noreply@payjaytrends.com>';

  const mailOptions = {
    from: fromName,
    to,
    subject: 'Welcome to Payjay Trends - Account Created',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: 'Outfit', Arial, sans-serif; background: #f9f9f9; margin: 0; padding: 0; }
          .container { max-width: 480px; margin: 30px auto; background: #ffffff; }
          .header { background: #111111; padding: 30px; text-align: center; }
          .header h1 { color: #ffffff; font-size: 18px; margin: 0; letter-spacing: 0.08em; text-transform: uppercase; }
          .body { padding: 40px 30px; }
          .body h2 { font-size: 14px; color: #111111; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 800; }
          .body p { font-size: 14px; color: #767676; line-height: 1.6; }
          .cta { text-align: center; margin: 30px 0; }
          .cta a { background: #111111; color: #ffffff; text-decoration: none; padding: 14px 40px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 700; }
          .footer { padding: 20px 30px; border-top: 1px solid #e5e5e5; text-align: center; }
          .footer p { font-size: 11px; color: #767676; margin: 0; text-transform: uppercase; letter-spacing: 0.08em; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Payjay Trends</h1>
          </div>
          <div class="body">
            <h2>Welcome, ${name}!</h2>
            <p>Your account has been successfully created. You can now browse our premium collection and place orders with ease.</p>
            <div class="cta">
              <a href="${process.env.APP_URL || 'http://localhost:3000'}/#/">Start Shopping</a>
            </div>
            <p>If you have any questions, feel free to contact our support team.</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Payjay Trends. Premium fashion in Ghana.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ Welcome email sent to ${to}`);
    return true;
  } catch (err) {
    console.error(`❌ Failed to send welcome email to ${to}:`, err.message);
    return false;
  }
}

module.exports = { sendPasswordResetCode, sendWelcomeEmail };