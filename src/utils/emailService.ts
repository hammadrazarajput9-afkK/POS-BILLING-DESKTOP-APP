/**
 * Brevo (formerly Sendinblue) HTTP API Email Service
 * Endpoint: https://api.brevo.com/v3/smtp/email
 */

export const BREVO_CONFIG = {
  apiUrl: 'https://api.brevo.com/v3/smtp/email',
  apiKey: 'xkeysib-c01cdc04d92670064e6af1b1b6a33bdeef903acd304a269f4a6a820',
  sender: {
    name: 'FMZ Friends Mobile Zone',
    email: 'hammadrazarajput9@gmail.com',
  },
};

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  message?: string;
}

/**
 * Sends a 6-digit OTP verification code to the dynamic Admin recipient email via Brevo HTTP API.
 */
export async function sendOtpEmail(
  recipientEmail: string,
  otpCode: string,
  recipientName?: string
): Promise<SendEmailResult> {
  const cleanEmail = recipientEmail.trim().toLowerCase();
  const cleanName = (recipientName || cleanEmail.split('@')[0] || 'Administrator').trim();

  if (!cleanEmail || !otpCode) {
    return {
      success: false,
      message: 'Recipient email address and OTP code are required.',
    };
  }

  const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin Login Verification</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f6f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f4f6f9; padding: 40px 15px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 520px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%); padding: 32px 24px; text-align: center;">
              <h1 style="margin: 0; font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">
                FMZ Friends Mobile Zone
              </h1>
              <p style="margin: 6px 0 0 0; font-size: 12px; font-weight: 700; color: #e0e7ff; text-transform: uppercase; letter-spacing: 1.5px;">
                Point of Sale Terminal • 2FA Security
              </p>
            </td>
          </tr>

          <!-- Main Body -->
          <tr>
            <td style="padding: 32px 28px;">
              <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 1.6; color: #334155;">
                Hello <strong>${cleanName}</strong>,
              </p>
              <p style="margin: 0 0 24px 0; font-size: 13px; line-height: 1.6; color: #475569;">
                An Administrator login attempt was initiated for your registered account (<strong>${cleanEmail}</strong>). Please use the following 6-digit one-time passcode (OTP) to complete two-step verification:
              </p>

              <!-- OTP Code Display Card -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 0 0 24px 0;">
                <tr>
                  <td align="center" style="background-color: #f8fafc; border: 2px dashed #c7d2fe; border-radius: 12px; padding: 22px 16px;">
                    <span style="font-family: 'Courier New', Courier, monospace; font-size: 34px; font-weight: 900; letter-spacing: 8px; color: #4338ca; display: block; margin-left: 8px;">
                      ${otpCode}
                    </span>
                    <span style="display: block; margin-top: 8px; font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 1px;">
                      Valid for 10 Minutes
                    </span>
                  </td>
                </tr>
              </table>

              <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px 14px; border-radius: 6px; margin: 0 0 24px 0;">
                <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #92400e; font-weight: 500;">
                  <strong>Security Reminder:</strong> Never share this code with anyone. FMZ Support or staff will never request your verification passcode.
                </p>
              </div>

              <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #64748b;">
                If you did not initiate this login request, please disregard this email or update your Master Password immediately.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 24px; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0; font-size: 11px; color: #94a3b8; font-weight: 500;">
                &copy; ${new Date().getFullYear()} FMZ Friends Mobile Zone POS Pro. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  const textBody = `FMZ Friends Mobile Zone - Admin 2FA Passcode\n\nYour 6-digit verification code is: ${otpCode}\n\nThis code is valid for 10 minutes. If you did not request this login code, please disregard this message.`;

  try {
    const payload = {
      sender: {
        name: BREVO_CONFIG.sender.name,
        email: BREVO_CONFIG.sender.email,
      },
      to: [
        {
          email: cleanEmail,
          name: cleanName,
        },
      ],
      subject: `FMZ POS - Admin Verification Code: ${otpCode}`,
      htmlContent: htmlBody,
      textContent: textBody,
    };

    const response = await fetch(BREVO_CONFIG.apiUrl, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': BREVO_CONFIG.apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      return {
        success: true,
        messageId: data?.messageId || 'SENT',
      };
    } else {
      let errorText = '';
      try {
        const errorJson = await response.json();
        errorText = errorJson?.message || errorJson?.code || JSON.stringify(errorJson);
      } catch {
        errorText = await response.text();
      }

      console.error('[Brevo HTTP API Error]:', response.status, errorText);
      return {
        success: false,
        message: errorText || `Brevo API HTTP status ${response.status}`,
      };
    }
  } catch (error: any) {
    console.error('[Brevo Network Error]:', error);
    return {
      success: false,
      message: error?.message || 'Network error while contacting Brevo API',
    };
  }
}
