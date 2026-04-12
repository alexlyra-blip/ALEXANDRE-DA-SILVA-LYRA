import { NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import firebaseConfig from '@/firebase-applet-config.json';

if (!admin.apps.length) {
  try {
    admin.initializeApp();
  } catch {
    admin.initializeApp({
      projectId: firebaseConfig.projectId,
    });
  }
}

export async function POST(request: Request) {
  try {
    const { email, password, name, secret } = await request.json();

    // Secret key to prevent unauthorized access
    const ADMIN_SECRET = process.env.ADMIN_CREATION_SECRET || 'change-me-in-env';
    
    if (secret !== ADMIN_SECRET) {
      return NextResponse.json(
        { error: 'Secret inválido. Configure ADMIN_CREATION_SECRET no .env.local' },
        { status: 403 }
      );
    }

    if (!email || !password || !name) {
      return NextResponse.json(
        { error: 'Email, senha e nome são obrigatórios' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'A senha deve ter pelo menos 6 caracteres' },
        { status: 400 }
      );
    }

    // Create user in Firebase Auth
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: name,
    });

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

    return NextResponse.json({
      success: true,
      message: 'Admin criado com sucesso!',
      user: {
        uid: userRecord.uid,
        email,
        name,
        role: 'admin',
      }
    });

  } catch (error: any) {
    console.error('Erro ao criar admin:', error);
    
    let errorMessage = error.message;
    if (error.code === 'auth/email-already-exists') {
      errorMessage = 'Este email já existe no sistema';
    } else if (error.code === 'auth/invalid-email') {
      errorMessage = 'Email inválido';
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
