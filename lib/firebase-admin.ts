import admin from 'firebase-admin';

let adminApp: admin.app.App | null = null;

let initError: string | null = null;

export function getAdminApp() {
  if (adminApp) return adminApp;
  if (admin.apps.length > 0) {
    adminApp = admin.app();
    return adminApp;
  }

  try {
    const saEnv = process.env.FIREBASE_SERVICE_ACCOUNT;
    
    if (saEnv) {
      let serviceAccount;
      
      // Tenta limpar a string de prefixos comuns como "JSON " ou blocos de código markdown
      let cleanedSaEnv = saEnv.trim();
      
      // Remove prefixo "JSON" se existir (comum ao copiar de alguns lugares)
      if (cleanedSaEnv.toUpperCase().startsWith('JSON')) {
        cleanedSaEnv = cleanedSaEnv.substring(4).trim();
      }
      
      // Remove blocos de código markdown
      cleanedSaEnv = cleanedSaEnv.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
      
      try {
        serviceAccount = JSON.parse(cleanedSaEnv);
      } catch (e: any) {
        const parseError = e.message;
        
        // Tenta extrair o primeiro objeto JSON balanceado
        const extractFirstJSON = (str: string) => {
          const start = str.indexOf('{');
          if (start === -1) return str;
          let depth = 0;
          let inString = false;
          let escape = false;
          for (let i = start; i < str.length; i++) {
            const char = str[i];
            if (inString) {
              if (escape) escape = false;
              else if (char === '\\') escape = true;
              else if (char === '"') inString = false;
            } else {
              if (char === '"') inString = true;
              else if (char === '{') depth++;
              else if (char === '}') {
                depth--;
                if (depth === 0) {
                  return str.substring(start, i + 1);
                }
              }
            }
          }
          return str;
        };

        const extracted = extractFirstJSON(cleanedSaEnv);
        
        try {
          serviceAccount = JSON.parse(extracted);
        } catch (e2: any) {
          let hint = "";
          if (!cleanedSaEnv.startsWith('{')) {
            hint = " O segredo não começa com '{'. Certifique-se de que colou o JSON completo do arquivo da conta de serviço.";
          }
          
          initError = `Erro ao processar FIREBASE_SERVICE_ACCOUNT: ${parseError}.${hint}`;
          throw new Error(initError);
        }
      }
      
      adminApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });

      console.log('Firebase Admin inicializado com sucesso para o projeto:', serviceAccount.project_id);
      return adminApp;
    }
    
    initError = "FIREBASE_SERVICE_ACCOUNT environment variable is missing. To use server-side Firebase features (like Webhooks), you must add your Firebase Service Account JSON string to the AI Studio Secrets menu as FIREBASE_SERVICE_ACCOUNT.";
    console.error('Falha ao inicializar Firebase Admin:', initError);
    // Explicitly return null instead of falling back to ADC
    return null;
  } catch (error: any) {
    console.error('Falha ao inicializar Firebase Admin:', error);
    initError = error.message;
    return null;
  }
}

export const getInitializationError = () => initError;

export const getAdminDb = () => {
  const app = getAdminApp();
  if (!app) return null;
  
  // O Admin SDK usa o banco (default) por padrão ao chamar firestore().
  // Isso atende à solicitação de usar o banco padrão em southamerica-east1.
  return admin.firestore();
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
