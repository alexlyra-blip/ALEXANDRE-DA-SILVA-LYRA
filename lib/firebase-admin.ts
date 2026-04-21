import admin from 'firebase-admin';

let adminApp: admin.app.App | null = null;

export function getAdminApp() {
  if (adminApp) return adminApp;
  if (admin.apps.length > 0) {
    adminApp = admin.app();
    return adminApp;
  }

  try {
    const saEnv = process.env.FIREBASE_SERVICE_ACCOUNT;
    
    if (saEnv) {
      const serviceAccount = JSON.parse(saEnv);
      adminApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      return adminApp;
    }
    
    // Fallback: Tentativa de inicialização padrão
    adminApp = admin.initializeApp();
    return adminApp;
  } catch (error) {
    console.error('Falha ao inicializar Firebase Admin:', error);
    return null;
  }
}

export const getAdminDb = () => {
  const app = getAdminApp();
  return app ? admin.firestore() : null;
};

export const getAdminAuth = () => {
  const app = getAdminApp();
  return app ? admin.auth() : null;
};

export const getAdminStorage = () => {
  const app = getAdminApp();
  return app ? admin.storage() : null;
};

// Exportamos o objeto admin para backward compatibility se necessário
export { admin };
