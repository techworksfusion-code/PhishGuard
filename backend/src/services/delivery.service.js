'use strict';

function sendOtp({ destination, code, channel = 'console', purpose = 'register' }) {
  if (channel === 'console') {
    console.log(`[OTP] ${purpose.toUpperCase()} code for ${destination}: ${code}`);
    return { sent: true, channel: 'console' };
  }

  throw new Error(`OTP channel "${channel}" is not configured.`);
}

module.exports = { sendOtp };
