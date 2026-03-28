export function formatErrorMessage(error: any): string {
  if (!error) return 'An unexpected error occurred.';
  
  const message = typeof error === 'string' ? error : error.message || String(error);
  
  try {
    const errObj = JSON.parse(message);
    if (errObj.error) {
      if (errObj.error.includes('Quota limit exceeded')) {
        return "You have exceeded your Firebase free tier quota. The quota will reset the next day. For detailed quota information, please check the Spark plan column in the Enterprise edition section of https://firebase.google.com/pricing#cloud-firestore.";
      }
      return errObj.error;
    }
  } catch (e) {
    // Not a JSON string, just return the message
  }
  
  return message;
}
