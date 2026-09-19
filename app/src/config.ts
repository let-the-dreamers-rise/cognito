/**
 * The deployed API Gateway endpoint. Not a secret - every call is authorised by
 * a per-device token that is never committed.
 */
const DEPLOYED_API = 'https://sbwkc12z06.execute-api.us-east-1.amazonaws.com';

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? DEPLOYED_API;

export const hasApi = () => API_URL.length > 0;
