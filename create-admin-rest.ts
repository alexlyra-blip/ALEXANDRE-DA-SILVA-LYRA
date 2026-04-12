#!/usr/bin/env node

/**
 * Script para criar admin usando Firebase REST API
 * Não requer Firebase Admin SDK ou credenciais especiais
 */

import * as readline from 'readline';

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
  console.log('\n🔐 Criador de Admin (Firebase REST API)\n');
  
  const email = await question('📧 Email: ');
  const password = await question('🔑 Senha: ');
  const name = await question('👤 Nome: ');
  
  if (!email || !password || !name) {
    console.error('\n❌ Campo obrigatório vazio');
    rl.close();
    return;
  }

  if (password.length < 6) {
    console.error('\n❌ Senha deve ter 6+ caracteres');
    rl.close();
    return;
  }

  try {
    console.log('\n⏳ Criando usuário...');
    
    // Step 1: Create user in Firebase Auth using REST API
    const apiKey = 'AIzaSyB3wYFRAZtdhGSy8tnD8MWBuP2JxzyP9o8';
    
    const authResponse = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          displayName: name,
          returnSecureToken: true,
        }),
      }
    );

    const authData = await authResponse.json();

    if (!authResponse.ok) {
      throw new Error(authData.error?.message || 'Erro ao criar usuário');
    }

    const uid = authData.localId;
    const idToken = authData.idToken;

    console.log('✓ Usuário criado no Firebase Auth');

    // Step 2: Create Firestore document using direct API
    const projectId = 'deft-apparatus-477017-c5';
    
    const firestoreResponse = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fields: {
            uid: { stringValue: uid },
            email: { stringValue: email },
            name: { stringValue: name },
            role: { stringValue: 'admin' },
            status: { stringValue: 'active' },
            photoUrl: { nullValue: null },
            avatarUrl: { nullValue: null },
            createdAt: { timestampValue: new Date().toISOString() },
          },
        }),
      }
    );

    if (!firestoreResponse.ok) {
      console.warn('⚠️ Perfil não pôde ser salvo automaticamente no Firestore');
      console.log('\n✅ Usuário criado em Firebase Auth!');
      console.log(`   UID: ${uid}`);
      console.log(`   Email: ${email}`);
      console.log('\n⚠️ Você precisa criar o documento manualmente no Firestore:');
      console.log('   Collection: users');
      console.log(`   Document ID: ${uid}`);
      console.log('   Campos:');
      console.log(`   - uid: ${uid}`);
      console.log(`   - email: ${email}`);
      console.log(`   - name: ${name}`);
      console.log(`   - role: admin`);
      console.log(`   - status: active`);
    } else {
      console.log('✓ Perfil salvo no Firestore');
      console.log('\n✅ Admin criado com sucesso!\n');
      console.log(`   📧 Email: ${email}`);
      console.log(`   👤 Nome: ${name}`);
      console.log(`   🎯 Role: admin`);
      console.log(`   🆔 UID: ${uid}\n`);
    }

  } catch (error: any) {
    console.error('\n❌ Erro:', error.message || error);
  }
  
  rl.close();
}

createAdmin();
