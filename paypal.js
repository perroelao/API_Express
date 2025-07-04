const checkoutNodeJssdk = require('@paypal/checkout-server-sdk');

function environment() {
    let clientId = "ASrT5J3EI_5Z3bAcGWkfN7QfBB8n5yIUg-6NgNxudxWQ86EYeITctTxj1FaTKa30FVe2FbL1fqXVFa-8";
    let clientSecret = "EN1Gb5w7b-ivM_ISxg7TIWL-AZnSf1MvQZyB2O1tImD5zzO0AsUnJqDXXfmLNyEfFpbgSl8OaTf7ym_k";
    return new checkoutNodeJssdk.core.SandboxEnvironment(clientId, clientSecret);
}

function client() {
    return new checkoutNodeJssdk.core.PayPalHttpClient(environment());
}

module.exports = { client };