/** Replaced with the deployed API Gateway endpoint after `cdk deploy`. */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? '';

export const hasApi = () => API_URL.length > 0;
