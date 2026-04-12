import * as admin from 'firebase-admin';
import * as readline from 'readline';
import * as fs from 'fs';

// Initialize Firebase Admin
if (!admin.apps.length) {
  try {
    admin.initializeApp();
  } catch (error) {
    console.error('Failed to initialize Firebase Admin SDK');
    console.error('Make sure you have GOOGLE_APPLICATION_CREDENTIALS environment variable set');
    process.exit(1);
  }
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer);
    });
  });
}

async function createAdmin() {
  console.log('\n🔐 Criador de Usuário Admin\n');
  
  const email = await question('Email do admin: ');
  const password = await question('Senha do admin: ');
  const name = await question('Nome completo: ');
  
  if (!email || !password || !name) {
    console.error('❌ Todos os campos são obrigatórios');
    rl.close();
    return;
  }
  
  if (password.length < 6) {
    console.error('❌ A senha deve ter pelo menos 6 caracteres');
    rl.close();
    return;
  }
  
  try {
    console.log('\n📝 Criando usuário...');
    
    // Create user in Firebase Auth
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: name,
    });
    
    console.log('✓ Usuário criado com sucesso no Firebase Auth');
    
    // Create user profile in Firestore
    const db = admin.firestore();
    await db.collection('users').doc(userRecord.uid).set({
      uid: userRecord.uid,
      email,
      name,
      role: 'admin',
      status: 'active',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      photoUrl: null,
      avatarUrl: null,
    });
    
    console.log('✓ Perfil de usuário criado com sucesso no Firestore');
    
    console.log('\n✅ Admin criado com sucesso!');
    console.log(`   UID: ${userRecord.uid}`);
    console.log(`   Email: ${email}`);
    console.log(`   Nome: ${name}`);
    console.log(`   Role: admin`);
    console.log('\n📧 Você pode agora fazer login com este usuário.\n');
    
  } catch (error: any) {
    console.error('\n❌ Erro ao criar admin:', error.message);
    
    if (error.code === 'auth/email-already-exists') {
      console.error('   Este email já existe no sistema');
    } else if (error.code === 'auth/invalid-email') {
      console.error('   Email inválido');
    }
  }
  
  rl.close();
}

createAdmin();
