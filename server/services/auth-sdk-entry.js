// Browser entry point for Aliyun Number Auth SDK
import AuthSDK from '../public/assets/numberAuth-web-sdk.js';

// Expose to window for the auth page
window.NumberAuthSDK = AuthSDK.default;
window.JSEncrypt = AuthSDK.JSEncrypt;
