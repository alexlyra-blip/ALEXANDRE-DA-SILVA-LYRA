import { NextResponse } from 'next/server';
import { getAdminDb, getAdminAuth } from '@/lib/firebase-admin';

export async function POST(request: Request) {
  try {
    const db = getAdminDb();
    const auth = getAdminAuth();
    
    if (!db || !auth) {
      return NextResponse.json({ error: 'Firebase connection failed' }, { status: 500 });
    }

    const { uid, newPassword, adminUid } = await request.json();

    if (!uid || !newPassword || !adminUid) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    // Verify the requester is an admin or the creator of the user
    const adminDoc = await db.collection('users').doc(adminUid).get();
    
    if (!adminDoc.exists) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const adminData = adminDoc.data();
    const targetUserDoc = await db.collection('users').doc(uid).get();
    
    if (!targetUserDoc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const targetUserData = targetUserDoc.data();

    // Permission check: Admin can reset any, Promotora can only reset their own created users
    const canReset = adminData?.role === 'admin' || (adminData?.role === 'promotora' && targetUserData?.createdBy === adminUid);

    if (!canReset) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Update password in Firebase Auth
    await auth.updateUser(uid, {
      password: newPassword,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error resetting password:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
