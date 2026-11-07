'use strict';

function sendOtp({ destination, code, channel = 'console', purpose = 'register' }) {
  const result = { sent: true, channel };

  if (channel === 'console') {
    console.log(`[OTP] ${purpose.toUpperCase()} code for ${destination}: ${code}`);
    result.code = code; // expose code in dev/console channel for testing
  }

  return result;
}

module.exports = { sendOtp };
