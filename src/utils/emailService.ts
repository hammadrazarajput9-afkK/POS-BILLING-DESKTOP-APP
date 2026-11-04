import emailjs from '@emailjs/browser';

export const EMAILJS_CONFIG = {
  serviceId: 'service_uxsskig',
  templateId: 'template_del4lfi',
  publicKey: 'RVQvKFbWtVi2O86V6',
};

/**
 * Sends a 6-digit OTP code to the recipient's email using EmailJS.
 * Template parameters:
 * - email: recipient email
 * - passcode: 6-digit OTP
 */
export const sendOtpEmail = async (recipientEmail: string, otpCode: string): Promise<{ success: boolean; message?: string }> => {
  try {
    const templateParams = {
      email: recipientEmail.trim(),
      passcode: otpCode.trim(),
      to_email: recipientEmail.trim(),
      to_name: recipientEmail.split('@')[0],
    };

    const response = await emailjs.send(
      EMAILJS_CONFIG.serviceId,
      EMAILJS_CONFIG.templateId,
      templateParams,
      EMAILJS_CONFIG.publicKey
    );

    if (response.status === 200 || response.text === 'OK') {
      return { success: true };
    } else {
      return { success: false, message: response.text };
    }
  } catch (error: any) {
    console.error('[EmailJS] Failed to send OTP:', error);
    // Also attempt REST fallback if SDK has issues
    try {
      const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: EMAILJS_CONFIG.serviceId,
          template_id: EMAILJS_CONFIG.templateId,
          user_id: EMAILJS_CONFIG.publicKey,
          template_params: {
            email: recipientEmail.trim(),
            passcode: otpCode.trim(),
            to_email: recipientEmail.trim(),
          },
        }),
      });
      if (res.ok) {
        return { success: true };
      }
    } catch (fallbackError) {
      console.error('[EmailJS REST Fallback Error]:', fallbackError);
    }
    return { success: false, message: error?.text || error?.message || 'Failed to dispatch email' };
  }
};
